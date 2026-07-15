import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type {
  ExpertVerificationStatus,
  ProgramStatus,
  UserStatus,
} from '@/generated/prisma/client';
import { parseProgramListQuery } from '@/modules/programs/query';
import { getProgramListFacets, listPublicPrograms } from '@/modules/programs/service';

import { cleanupOwnData, disconnect, runId, testEmail, testPrisma } from './helpers/db';

/**
 * 공개 목록 service 통합 테스트 — handalsalgi_test(migration만·seed 없음).
 * 모든 fixture는 이 파일이 직접 생성하고 afterAll에서 FK 역순으로 정리한다(seed 미의존).
 */

const deps = { db: testPrisma };

let seq = 0;
const uid = (label: string) => `${runId}-pl-${label}-${seq++}`;

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
      countryNameKo: '국가',
      countryNameEn: 'Country',
      cityNameKo: '도시',
      cityNameEn: 'City',
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
      nameKo: '카테고리',
      nameEn: 'Category',
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
  } = {},
) {
  const user = await testPrisma.user.create({
    data: {
      email: testEmail(uid('expert')),
      role: 'EXPERT',
      emailVerified: new Date(),
      status: opts.userStatus ?? 'ACTIVE',
      deletedAt: opts.userDeletedAt ?? null,
    },
    select: { id: true },
  });
  userIds.push(user.id);

  const profile = await testPrisma.expertProfile.create({
    data: {
      userId: user.id,
      slug: uid('profile'),
      displayName: '전문가',
      bio: '소개',
      baseDestinationId,
      verificationStatus: opts.verificationStatus ?? 'APPROVED',
      profilePublished: opts.profilePublished ?? true,
    },
    select: { id: true },
  });
  expertIds.push(profile.id);
  return profile.id;
}

async function makeProgram(opts: {
  destinationId: string;
  categoryId: string;
  expertId: string;
  status?: ProgramStatus;
  deletedAt?: Date | null;
  basePrice?: number;
  averageRating?: number | null;
  featured?: boolean;
  withImage?: boolean;
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
      fullDescription: '상세',
      programType: 'PRIVATE',
      durationDays: 30,
      sessionCount: 1,
      cancellationPolicy: 'flexible',
      basePrice: opts.basePrice ?? 100_000,
      currency: 'KRW',
      status,
      deletedAt: opts.deletedAt ?? null,
      featured: opts.featured ?? false,
      averageRating: opts.averageRating ?? null,
      publishedAt: status === 'PUBLISHED' ? new Date() : null,
      ...(opts.withImage
        ? {
            media: {
              create: { url: 'https://example.test/thumb.jpg', altText: '대체', type: 'IMAGE' },
            },
          }
        : {}),
    },
    select: { id: true, slug: true },
  });
  programIds.push(created.id);
  return created;
}

async function listSlugs(query: Record<string, string | string[] | undefined>) {
  const parsed = parseProgramListQuery(query);
  const result = await listPublicPrograms(parsed, deps);
  return result.items.map((item) => item.slug);
}

afterAll(async () => {
  await testPrisma.program.deleteMany({ where: { id: { in: programIds } } });
  await testPrisma.expertProfile.deleteMany({ where: { id: { in: expertIds } } });
  await testPrisma.user.deleteMany({ where: { id: { in: userIds } } });
  await testPrisma.destination.deleteMany({ where: { id: { in: destIds } } });
  await testPrisma.category.deleteMany({ where: { id: { in: catIds } } });
  await cleanupOwnData();
  await disconnect();
});

describe('listPublicPrograms — visibility 계약', () => {
  let scopeDest: string;
  const present: Record<string, string> = {};

  beforeAll(async () => {
    const dest = await makeDestination();
    scopeDest = dest.slug;
    const cat = await makeCategory();

    const approvedExpert = await makeExpert(dest.id);
    const baseline = await makeProgram({
      destinationId: dest.id,
      categoryId: cat.id,
      expertId: approvedExpert,
    });
    present.baseline = baseline.slug;

    // 프로그램 상태 결함
    for (const status of [
      'DRAFT',
      'PENDING_REVIEW',
      'UNPUBLISHED',
      'ARCHIVED',
    ] as ProgramStatus[]) {
      const p = await makeProgram({
        destinationId: dest.id,
        categoryId: cat.id,
        expertId: approvedExpert,
        status,
      });
      present[`status_${status}`] = p.slug;
    }
    const deleted = await makeProgram({
      destinationId: dest.id,
      categoryId: cat.id,
      expertId: approvedExpert,
      status: 'PUBLISHED',
      deletedAt: new Date(),
    });
    present.deleted = deleted.slug;

    // 전문가/유저 결함
    const pendingExpert = await makeExpert(dest.id, {
      verificationStatus: 'PENDING',
      profilePublished: false,
    });
    present.expertPending = (
      await makeProgram({ destinationId: dest.id, categoryId: cat.id, expertId: pendingExpert })
    ).slug;

    const unpublishedExpert = await makeExpert(dest.id, { profilePublished: false });
    present.expertUnpublished = (
      await makeProgram({ destinationId: dest.id, categoryId: cat.id, expertId: unpublishedExpert })
    ).slug;

    const suspendedUserExpert = await makeExpert(dest.id, { userStatus: 'SUSPENDED' });
    present.userSuspended = (
      await makeProgram({
        destinationId: dest.id,
        categoryId: cat.id,
        expertId: suspendedUserExpert,
      })
    ).slug;

    const deletedUserExpert = await makeExpert(dest.id, {
      userStatus: 'ACTIVE',
      userDeletedAt: new Date(),
    });
    present.userDeleted = (
      await makeProgram({ destinationId: dest.id, categoryId: cat.id, expertId: deletedUserExpert })
    ).slug;
  });

  it('PUBLISHED + APPROVED/published expert + ACTIVE user만 노출한다', async () => {
    const slugs = await listSlugs({ destination: scopeDest });
    expect(slugs).toContain(present.baseline);

    for (const [key, slug] of Object.entries(present)) {
      if (key === 'baseline') {
        continue;
      }
      expect(slugs, `${key} must be hidden`).not.toContain(slug);
    }
  });
});

describe('listPublicPrograms — 필터 (fail-closed)', () => {
  let shared: { destinationId: string; categoryId: string; expertId: string };
  let destKR: { id: string; slug: string };
  let destTH: { id: string; slug: string };
  let catA: { id: string; slug: string };
  let catB: { id: string; slug: string };
  let inactiveDest: { id: string; slug: string };
  let inactiveCat: { id: string; slug: string };
  const slugByKey: Record<string, string> = {};

  beforeAll(async () => {
    destKR = await makeDestination({ countryCode: 'KR' });
    destTH = await makeDestination({ countryCode: 'TH' });
    catA = await makeCategory();
    catB = await makeCategory();
    inactiveDest = await makeDestination({ active: false, countryCode: 'VN' });
    inactiveCat = await makeCategory({ active: false });

    const expertKR = await makeExpert(destKR.id);
    const expertTH = await makeExpert(destTH.id);

    slugByKey.krA = (
      await makeProgram({ destinationId: destKR.id, categoryId: catA.id, expertId: expertKR })
    ).slug;
    slugByKey.krB = (
      await makeProgram({ destinationId: destKR.id, categoryId: catB.id, expertId: expertKR })
    ).slug;
    slugByKey.thA = (
      await makeProgram({ destinationId: destTH.id, categoryId: catA.id, expertId: expertTH })
    ).slug;
    // inactive destination / category 위의 프로그램(그 외 조건은 모두 정상)
    slugByKey.inactiveDest = (
      await makeProgram({ destinationId: inactiveDest.id, categoryId: catA.id, expertId: expertKR })
    ).slug;
    slugByKey.inactiveCat = (
      await makeProgram({
        destinationId: destKR.id,
        categoryId: inactiveCat.id,
        expertId: expertKR,
      })
    ).slug;
    shared = { destinationId: destKR.id, categoryId: catA.id, expertId: expertKR };
  });

  it('country 필터는 해당 국가만 반환한다', async () => {
    const slugs = await listSlugs({ country: 'TH', destination: destTH.slug });
    expect(slugs).toContain(slugByKey.thA);
    expect(slugs).not.toContain(slugByKey.krA);
  });

  it('destination 필터는 해당 도시만 반환한다', async () => {
    const slugs = await listSlugs({ destination: destKR.slug });
    expect(slugs).toEqual(expect.arrayContaining([slugByKey.krA, slugByKey.krB]));
    expect(slugs).not.toContain(slugByKey.thA);
  });

  it('category 필터는 해당 카테고리만 반환한다', async () => {
    const slugs = await listSlugs({ destination: destKR.slug, category: catA.slug });
    expect(slugs).toContain(slugByKey.krA);
    expect(slugs).not.toContain(slugByKey.krB);
  });

  it('inactive destination/category 위의 프로그램은 노출되지 않는다', async () => {
    const byInactiveDest = await listSlugs({ destination: inactiveDest.slug });
    expect(byInactiveDest).toEqual([]);
    const byInactiveCat = await listSlugs({ category: inactiveCat.slug });
    expect(byInactiveCat).not.toContain(slugByKey.inactiveCat);
  });

  it('존재하지 않는(문법상 유효한) 필터는 fail-closed로 빈 목록', async () => {
    expect(await listSlugs({ destination: 'no-such-destination' })).toEqual([]);
    expect(await listSlugs({ category: 'no-such-category' })).toEqual([]);
    expect(await listSlugs({ country: 'ZZ' })).toEqual([]);
  });

  it('country + destination 불일치는 AND로 0건', async () => {
    // KR 도시 + TH 국가 → 불일치
    const slugs = await listSlugs({ country: 'TH', destination: destKR.slug });
    expect(slugs).toEqual([]);
  });

  it('query parameter로 status를 조작해도 비공개 행을 노출하지 못한다', async () => {
    const draft = await makeProgram({ ...shared, status: 'DRAFT' });
    const slugs = await listSlugs({ status: 'DRAFT', destination: destKR.slug });
    expect(slugs).not.toContain(draft.slug);
  });
});

describe('listPublicPrograms — 정렬', () => {
  let destSlug: string;
  const s: Record<string, string> = {};

  beforeAll(async () => {
    const dest = await makeDestination();
    destSlug = dest.slug;
    const cat = await makeCategory();
    const expert = await makeExpert(dest.id);
    const base = { destinationId: dest.id, categoryId: cat.id, expertId: expert };

    s.cheap = (
      await makeProgram({ ...base, basePrice: 10_000, averageRating: 3.0, featured: false })
    ).slug;
    s.mid = (
      await makeProgram({ ...base, basePrice: 50_000, averageRating: null, featured: false })
    ).slug;
    s.pricey = (
      await makeProgram({ ...base, basePrice: 90_000, averageRating: 5.0, featured: false })
    ).slug;
    s.featured = (
      await makeProgram({ ...base, basePrice: 70_000, averageRating: 4.0, featured: true })
    ).slug;
  });

  it('price_asc / price_desc', async () => {
    const asc = await listSlugs({ destination: destSlug, sort: 'price_asc' });
    expect(asc.indexOf(s.cheap)).toBeLessThan(asc.indexOf(s.pricey));
    const desc = await listSlugs({ destination: destSlug, sort: 'price_desc' });
    expect(desc.indexOf(s.pricey)).toBeLessThan(desc.indexOf(s.cheap));
  });

  it('rating은 내림차순이며 null은 마지막', async () => {
    const byRating = await listSlugs({ destination: destSlug, sort: 'rating' });
    expect(byRating.indexOf(s.pricey)).toBeLessThan(byRating.indexOf(s.cheap));
    expect(byRating.indexOf(s.mid)).toBe(byRating.length - 1); // null rating last
  });

  it('featured가 최상단', async () => {
    const byFeatured = await listSlugs({ destination: destSlug, sort: 'featured' });
    expect(byFeatured[0]).toBe(s.featured);
  });
});

describe('listPublicPrograms — pagination (id tie-breaker · 무중복)', () => {
  let destSlug: string;
  let expectedOrder: string[];

  beforeAll(async () => {
    const dest = await makeDestination();
    destSlug = dest.slug;
    const cat = await makeCategory();
    const expert = await makeExpert(dest.id);
    const ids: { id: string; slug: string }[] = [];
    // 15개 동일 basePrice → 정렬키 동점, 순서는 id tie-breaker로만 결정
    for (let i = 0; i < 15; i += 1) {
      ids.push(
        await makeProgram({
          destinationId: dest.id,
          categoryId: cat.id,
          expertId: expert,
          basePrice: 100_000,
        }),
      );
    }
    expectedOrder = [...ids].sort((a, b) => (a.id < b.id ? -1 : 1)).map((p) => p.slug);
  });

  it('page 경계에서 중복·누락 없이 id 순서로 나뉜다', async () => {
    const page1 = await listPublicPrograms(
      parseProgramListQuery({ destination: destSlug, sort: 'price_asc', page: '1' }),
      deps,
    );
    const page2 = await listPublicPrograms(
      parseProgramListQuery({ destination: destSlug, sort: 'price_asc', page: '2' }),
      deps,
    );

    expect(page1.total).toBe(15);
    expect(page1.totalPages).toBe(2);
    expect(page1.items).toHaveLength(12);
    expect(page2.items).toHaveLength(3);

    const combined = [...page1.items, ...page2.items].map((i) => i.slug);
    expect(new Set(combined).size).toBe(15); // 무중복
    expect(combined).toEqual(expectedOrder); // id tie-breaker 결정적
  });

  it('page > totalPages는 빈 items와 정확한 total', async () => {
    const result = await listPublicPrograms(
      parseProgramListQuery({ destination: destSlug, page: '99' }),
      deps,
    );
    expect(result.items).toEqual([]);
    expect(result.total).toBe(15);
    expect(result.totalPages).toBe(2);
  });

  it('결과가 없으면 total 0 / totalPages 0 / items []', async () => {
    const empty = await listPublicPrograms(
      parseProgramListQuery({ destination: 'no-such-destination' }),
      deps,
    );
    expect(empty).toMatchObject({ total: 0, totalPages: 0, page: 1, items: [] });
  });
});

describe('listPublicPrograms — JSON-safe DTO', () => {
  let item: Awaited<ReturnType<typeof listPublicPrograms>>['items'][number] | undefined;

  beforeAll(async () => {
    const dest = await makeDestination();
    const cat = await makeCategory();
    const expert = await makeExpert(dest.id);
    const prog = await makeProgram({
      destinationId: dest.id,
      categoryId: cat.id,
      expertId: expert,
      averageRating: 4.5,
      withImage: true,
    });
    const result = await listPublicPrograms(
      parseProgramListQuery({ destination: dest.slug }),
      deps,
    );
    item = result.items.find((i) => i.slug === prog.slug);
  });

  it('averageRating은 number, thumbnail은 plain object, expert PII 미포함', () => {
    expect(item).toBeDefined();
    expect(typeof item!.averageRating).toBe('number');
    expect(item!.averageRating).toBeCloseTo(4.5);
    expect(item!.thumbnail).toEqual({ url: 'https://example.test/thumb.jpg', altText: '대체' });
    expect(item).not.toHaveProperty('expert');
    expect(item!.destination).not.toHaveProperty('latitude');
  });

  it('JSON round-trip으로 동일(Prisma Decimal/Date 미유출)', () => {
    expect(JSON.parse(JSON.stringify(item))).toEqual(item);
  });
});

describe('getProgramListFacets — active만 · 국가 dedupe', () => {
  let activeDest: { id: string; slug: string };
  let hiddenDest: { id: string; slug: string };
  let activeCat: { id: string; slug: string };
  let hiddenCat: { id: string; slug: string };

  beforeAll(async () => {
    activeDest = await makeDestination({ countryCode: 'ZZ' });
    await makeDestination({ countryCode: 'ZZ' }); // 같은 국가 → dedupe 대상
    hiddenDest = await makeDestination({ active: false, countryCode: 'ZZ' });
    activeCat = await makeCategory();
    hiddenCat = await makeCategory({ active: false });
  });

  it('inactive는 빠지고 country는 한 번만 나온다', async () => {
    const facets = await getProgramListFacets(deps);
    const destSlugs = facets.destinations.map((d) => d.slug);
    const catSlugs = facets.categories.map((c) => c.slug);

    expect(destSlugs).toContain(activeDest.slug);
    expect(destSlugs).not.toContain(hiddenDest.slug);
    expect(catSlugs).toContain(activeCat.slug);
    expect(catSlugs).not.toContain(hiddenCat.slug);
    expect(facets.countries.filter((c) => c.code === 'ZZ')).toHaveLength(1);
  });
});
