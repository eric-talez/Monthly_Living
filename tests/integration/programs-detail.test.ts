import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type {
  BookingType,
  ExpertVerificationStatus,
  ProgramStatus,
  ProgramType,
  UserStatus,
} from '@/generated/prisma/client';
import { getPublicProgramBySlug } from '@/modules/programs/service';
import type { PublicProgramDetail } from '@/modules/programs/types';

import { cleanupOwnData, disconnect, runId, testEmail, testPrisma } from './helpers/db';

/**
 * 공개 상세 service 통합 테스트 — handalsalgi_test(migration만·seed 없음).
 * fixture는 이 파일이 직접 만들고 afterAll에서 FK 역순으로 정리한다(seed 미의존, 다른 run 미접촉).
 * Phase 2A 목록 테스트의 검증된 maker 패턴을 자체 포함한다(공유 상태·import side effect 없음).
 */

const deps = { db: testPrisma };

let seq = 0;
const uid = (label: string) => `${runId}-pd-${label}-${seq++}`;

const programIds: string[] = [];
const expertIds: string[] = [];
const userIds: string[] = [];
const destIds: string[] = [];
const catIds: string[] = [];

async function makeDestination(opts: { active?: boolean; countryCode?: string } = {}) {
  const created = await testPrisma.destination.create({
    data: {
      slug: uid('dest'),
      countryCode: opts.countryCode ?? 'KR',
      countryNameKo: '대한민국',
      countryNameEn: 'South Korea',
      cityNameKo: '제주',
      cityNameEn: 'Jeju',
      latitude: 33.5,
      longitude: 126.5,
      timezone: 'Asia/Seoul',
      currency: 'KRW',
      active: opts.active ?? true,
    },
    select: { id: true, slug: true },
  });
  destIds.push(created.id);
  return created;
}

async function makeCategory(opts: { active?: boolean } = {}) {
  const created = await testPrisma.category.create({
    data: {
      slug: uid('cat'),
      nameKo: '웰니스',
      nameEn: 'Wellness',
      active: opts.active ?? true,
    },
    select: { id: true, slug: true },
  });
  catIds.push(created.id);
  return created;
}

async function makeExpert(
  baseDestinationId: string,
  opts: {
    verificationStatus?: ExpertVerificationStatus;
    profilePublished?: boolean;
    userStatus?: UserStatus;
    userDeletedAt?: Date | null;
    displayName?: string;
    bio?: string;
    languages?: string[];
    yearsOfExperience?: number;
    identityVerified?: boolean;
    credentialVerified?: boolean;
    responseRate?: number | null;
    responseTimeMinutes?: number | null;
    averageRating?: number | null;
    reviewCount?: number;
    completedBookingCount?: number;
  } = {},
) {
  const user = await testPrisma.user.create({
    data: {
      email: testEmail(uid('expert')),
      role: 'EXPERT',
      emailVerified: new Date(),
      status: opts.userStatus ?? 'ACTIVE',
      deletedAt: opts.userDeletedAt ?? null,
      // 아래 PII/관리 필드가 상세 DTO로 새지 않는지 검증하기 위해 값을 채운다.
      name: 'Auth Display Name',
      fullName: '실명 홍길동',
      phone: '+82-10-0000-0000',
    },
    select: { id: true },
  });
  userIds.push(user.id);

  const profile = await testPrisma.expertProfile.create({
    data: {
      userId: user.id,
      slug: uid('profile'),
      displayName: opts.displayName ?? '전문가',
      bio: opts.bio ?? '소개',
      baseDestinationId,
      verificationStatus: opts.verificationStatus ?? 'APPROVED',
      profilePublished: opts.profilePublished ?? true,
      languages: opts.languages ?? ['ko'],
      yearsOfExperience: opts.yearsOfExperience ?? 5,
      identityVerified: opts.identityVerified ?? false,
      credentialVerified: opts.credentialVerified ?? false,
      responseRate: opts.responseRate ?? null,
      responseTimeMinutes: opts.responseTimeMinutes ?? null,
      averageRating: opts.averageRating ?? null,
      reviewCount: opts.reviewCount ?? 0,
      completedBookingCount: opts.completedBookingCount ?? 0,
      verificationNote: '내부 심사 메모(노출 금지)',
    },
    select: { id: true, slug: true },
  });
  expertIds.push(profile.id);
  return profile;
}

type MediaInput = {
  type: 'IMAGE' | 'VIDEO';
  url: string;
  altText?: string | null;
  sortOrder?: number;
};

async function makeProgram(opts: {
  destinationId: string;
  categoryId: string;
  expertId: string;
  status?: ProgramStatus;
  deletedAt?: Date | null;
  fullDescription?: string;
  programType?: ProgramType;
  bookingType?: BookingType;
  isOnline?: boolean;
  maxParticipants?: number;
  languages?: string[];
  includes?: string[];
  excludes?: string[];
  requirements?: string[];
  meetingPoint?: string | null;
  petFriendly?: boolean;
  childFriendly?: boolean;
  accommodationIncluded?: boolean;
  transportIncluded?: boolean;
  averageRating?: number | null;
  reviewCount?: number;
  media?: MediaInput[];
}) {
  const status = opts.status ?? 'PUBLISHED';
  const created = await testPrisma.program.create({
    data: {
      expertId: opts.expertId,
      destinationId: opts.destinationId,
      categoryId: opts.categoryId,
      slug: uid('prog'),
      title: '프로그램',
      shortDescription: '요약',
      fullDescription: opts.fullDescription ?? '상세 설명',
      programType: opts.programType ?? 'PRIVATE',
      bookingType: opts.bookingType ?? 'REQUEST',
      isOnline: opts.isOnline ?? false,
      durationDays: 30,
      sessionCount: 8,
      maxParticipants: opts.maxParticipants ?? 4,
      languages: opts.languages ?? ['ko'],
      includes: opts.includes ?? [],
      excludes: opts.excludes ?? [],
      requirements: opts.requirements ?? [],
      meetingPoint: opts.meetingPoint ?? null,
      cancellationPolicy: 'flexible',
      basePrice: 100_000,
      currency: 'KRW',
      petFriendly: opts.petFriendly ?? false,
      childFriendly: opts.childFriendly ?? false,
      accommodationIncluded: opts.accommodationIncluded ?? false,
      transportIncluded: opts.transportIncluded ?? false,
      averageRating: opts.averageRating ?? null,
      reviewCount: opts.reviewCount ?? 0,
      status,
      deletedAt: opts.deletedAt ?? null,
      publishedAt: status === 'PUBLISHED' ? new Date() : null,
      ...(opts.media
        ? {
            media: {
              create: opts.media.map((m) => ({
                type: m.type,
                url: m.url,
                altText: m.altText ?? null,
                sortOrder: m.sortOrder ?? 0,
              })),
            },
          }
        : {}),
    },
    select: { id: true, slug: true },
  });
  programIds.push(created.id);
  return created;
}

afterAll(async () => {
  // ProgramMedia는 Program 삭제 시 cascade된다. FK 역순으로 정리한다.
  await testPrisma.program.deleteMany({ where: { id: { in: programIds } } });
  await testPrisma.expertProfile.deleteMany({ where: { id: { in: expertIds } } });
  await testPrisma.user.deleteMany({ where: { id: { in: userIds } } });
  await testPrisma.destination.deleteMany({ where: { id: { in: destIds } } });
  await testPrisma.category.deleteMany({ where: { id: { in: catIds } } });
  await cleanupOwnData();
  await disconnect();
});

describe('getPublicProgramBySlug — visibility 계약(비공개·미존재는 null 하나로 수렴)', () => {
  let publicSlug: string;
  const hidden: Record<string, string> = {};

  beforeAll(async () => {
    const dest = await makeDestination();
    const cat = await makeCategory();
    const approved = await makeExpert(dest.id);

    publicSlug = (
      await makeProgram({ destinationId: dest.id, categoryId: cat.id, expertId: approved.id })
    ).slug;

    // Program 상태 결함(각각 독립)
    for (const status of [
      'DRAFT',
      'PENDING_REVIEW',
      'UNPUBLISHED',
      'ARCHIVED',
    ] as ProgramStatus[]) {
      hidden[`status_${status}`] = (
        await makeProgram({
          destinationId: dest.id,
          categoryId: cat.id,
          expertId: approved.id,
          status,
        })
      ).slug;
    }
    hidden.deleted = (
      await makeProgram({
        destinationId: dest.id,
        categoryId: cat.id,
        expertId: approved.id,
        deletedAt: new Date(),
      })
    ).slug;

    // inactive destination / category (그 외 조건은 정상)
    const inactiveDest = await makeDestination({ active: false });
    hidden.inactiveDest = (
      await makeProgram({
        destinationId: inactiveDest.id,
        categoryId: cat.id,
        expertId: approved.id,
      })
    ).slug;
    const inactiveCat = await makeCategory({ active: false });
    hidden.inactiveCat = (
      await makeProgram({
        destinationId: dest.id,
        categoryId: inactiveCat.id,
        expertId: approved.id,
      })
    ).slug;

    // 전문가 verificationStatus 독립 검증(나머지는 공개 가능 상태 유지)
    for (const verificationStatus of [
      'PENDING',
      'UNDER_REVIEW',
      'REJECTED',
    ] as ExpertVerificationStatus[]) {
      const expert = await makeExpert(dest.id, { verificationStatus, profilePublished: true });
      hidden[`verification_${verificationStatus}`] = (
        await makeProgram({ destinationId: dest.id, categoryId: cat.id, expertId: expert.id })
      ).slug;
    }

    // profilePublished=false 독립 검증(APPROVED이나 미게시)
    const unpublishedExpert = await makeExpert(dest.id, {
      verificationStatus: 'APPROVED',
      profilePublished: false,
    });
    hidden.expertUnpublished = (
      await makeProgram({
        destinationId: dest.id,
        categoryId: cat.id,
        expertId: unpublishedExpert.id,
      })
    ).slug;

    // User.status 독립 검증(deletedAt=null → status 조건만으로 차단)
    const suspended = await makeExpert(dest.id, { userStatus: 'SUSPENDED', userDeletedAt: null });
    hidden.userSuspended = (
      await makeProgram({ destinationId: dest.id, categoryId: cat.id, expertId: suspended.id })
    ).slug;
    const userDeleted = await makeExpert(dest.id, { userStatus: 'DELETED', userDeletedAt: null });
    hidden.userStatusDeleted = (
      await makeProgram({ destinationId: dest.id, categoryId: cat.id, expertId: userDeleted.id })
    ).slug;

    // User.deletedAt 독립 검증(status=ACTIVE이나 soft-delete)
    const softDeleted = await makeExpert(dest.id, {
      userStatus: 'ACTIVE',
      userDeletedAt: new Date(),
    });
    hidden.userDeletedAt = (
      await makeProgram({ destinationId: dest.id, categoryId: cat.id, expertId: softDeleted.id })
    ).slug;
  });

  it('완전 공개 프로그램은 상세 DTO를 반환한다(선택 필드 빈 값 처리)', async () => {
    const detail = await getPublicProgramBySlug(publicSlug, deps);
    expect(detail).not.toBeNull();
    expect(detail!.slug).toBe(publicSlug);
    expect(detail!.includes).toEqual([]);
    expect(detail!.excludes).toEqual([]);
    expect(detail!.requirements).toEqual([]);
    expect(detail!.meetingPoint).toBeNull();
    expect(detail!.media).toEqual([]);
  });

  it('모든 비공개 조건은 각각 null로 수렴한다', async () => {
    for (const [key, slug] of Object.entries(hidden)) {
      expect(await getPublicProgramBySlug(slug, deps), `${key} must resolve to null`).toBeNull();
    }
  });

  it('형식 오류 slug와 존재하지 않는(형식상 유효) slug는 null', async () => {
    expect(await getPublicProgramBySlug('Bad Slug!', deps)).toBeNull(); // malformed
    expect(await getPublicProgramBySlug('under_score', deps)).toBeNull(); // malformed
    expect(await getPublicProgramBySlug(`${runId}-pd-no-such-slug`, deps)).toBeNull(); // absent
  });
});

describe('getPublicProgramBySlug — JSON-safe DTO · media 순서 · no-leak', () => {
  let detail: PublicProgramDetail | null = null;

  beforeAll(async () => {
    const dest = await makeDestination();
    const cat = await makeCategory();
    const expert = await makeExpert(dest.id, {
      displayName: '김민준',
      bio: '10년 경력 트레이너',
      languages: ['ko', 'en'],
      yearsOfExperience: 10,
      identityVerified: true,
      credentialVerified: true,
      responseRate: 95,
      responseTimeMinutes: 20,
      averageRating: 4.8,
      reviewCount: 30,
      completedBookingCount: 50,
    });
    const prog = await makeProgram({
      destinationId: dest.id,
      categoryId: cat.id,
      expertId: expert.id,
      averageRating: 4.5,
      reviewCount: 12,
      fullDescription: '자세한 설명',
      includes: ['숙소', '식사'],
      excludes: ['항공권'],
      requirements: ['수영 가능'],
      languages: ['ko', 'en'],
      meetingPoint: '제주공항 3번 게이트',
      maxParticipants: 6,
      programType: 'GROUP',
      bookingType: 'INSTANT',
      petFriendly: true,
      accommodationIncluded: true,
      media: [
        { type: 'IMAGE', url: 'https://example.test/b.jpg', altText: 'B', sortOrder: 2 },
        { type: 'IMAGE', url: 'https://example.test/a.jpg', altText: 'A', sortOrder: 1 },
        { type: 'VIDEO', url: 'https://example.test/v.mp4', altText: 'V', sortOrder: 0 },
        { type: 'IMAGE', url: 'https://example.test/d.jpg', altText: null, sortOrder: 3 },
        // 형식은 IMAGE이지만 비-http(s) URL — service의 URL 가드가 제외해야 한다.
        { type: 'IMAGE', url: 'javascript:alert(1)', altText: 'X', sortOrder: 4 },
      ],
    });
    detail = await getPublicProgramBySlug(prog.slug, deps);
  });

  it('공개 필드가 채워지고 Decimal(program·expert rating)은 number로 변환된다', () => {
    expect(detail).not.toBeNull();
    expect(typeof detail!.averageRating).toBe('number');
    expect(detail!.averageRating).toBeCloseTo(4.5);
    expect(typeof detail!.expert.averageRating).toBe('number');
    expect(detail!.expert.averageRating).toBeCloseTo(4.8);
    expect(detail!.maxParticipants).toBe(6);
    expect(detail!.programType).toBe('GROUP');
    expect(detail!.bookingType).toBe('INSTANT');
    expect(detail!.includes).toEqual(['숙소', '식사']);
    expect(detail!.meetingPoint).toBe('제주공항 3번 게이트');
    expect(detail!.petFriendly).toBe(true);
    expect(detail!.expert.displayName).toBe('김민준');
  });

  it('media는 IMAGE만·http(s)만·sortOrder 오름차순으로 정렬된다(VIDEO·비정상 URL 제외)', () => {
    const urls = detail!.media.map((m) => m.url);
    expect(urls).toEqual([
      'https://example.test/a.jpg',
      'https://example.test/b.jpg',
      'https://example.test/d.jpg',
    ]);
    expect(detail!.media.every((m) => m.type === 'IMAGE')).toBe(true);
    expect(urls).not.toContain('https://example.test/v.mp4'); // VIDEO 제외
    expect(urls).not.toContain('javascript:alert(1)'); // 비-http(s) 제외
    expect(detail!.media[2]?.altText).toBeNull(); // altText null 보존
  });

  it('전문가 요약·DTO에 PII·관리 필드가 없다', () => {
    const expert = detail!.expert as unknown as Record<string, unknown>;
    for (const forbidden of [
      'userId',
      'user',
      'email',
      'name',
      'fullName',
      'phone',
      'verificationStatus',
      'verificationNote',
      'profilePublished',
      'baseDestinationId',
    ]) {
      expect(expert, `expert.${forbidden} must be absent`).not.toHaveProperty(forbidden);
    }
    // 내부 메모·실명·인증 상태 문자열이 직렬화 결과 어디에도 새지 않는다.
    const serialized = JSON.stringify(detail);
    expect(serialized).not.toContain('내부 심사 메모');
    expect(serialized).not.toContain('실명 홍길동');
    expect(serialized).not.toContain('Auth Display Name');
  });

  it('JSON round-trip으로 동일(Prisma Decimal/Date 미유출)', () => {
    expect(JSON.parse(JSON.stringify(detail))).toEqual(detail);
  });
});
