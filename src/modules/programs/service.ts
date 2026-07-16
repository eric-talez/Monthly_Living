import 'server-only';

import { Prisma } from '@/generated/prisma/client';

import { getDefaultProgramsDeps, type ProgramsDeps } from './deps';
import { isDisplayableImageUrl } from './media';
import { computePagination } from './query';
import type {
  ProgramListFacets,
  ProgramListQuery,
  ProgramListResult,
  ProgramCountryFacet,
  PublicProgramDetail,
  PublicProgramSummary,
} from './types';
import { parseProgramSlug } from './validation';

/**
 * 공개 프로그램 목록의 DB 경계(server-only) — visibility 계약을 공용 where builder로 중앙화한다.
 * page/RSC는 파싱된 쿼리만 넘기고, status/deletedAt/expert 승인 조건을 클라이언트가 제어할 수 없다.
 */

/**
 * 공개 노출 필요충분조건(목록·상세 공용). 사용자 필터는 이 위에 AND로만 덧붙인다.
 * 스키마가 "PUBLISHED ⇒ APPROVED expert"를 DB로 강제하지 않으므로 expert 승인·게시·user
 * 상태를 반드시 join한다.
 */
export const PUBLIC_PROGRAM_WHERE = {
  status: 'PUBLISHED',
  deletedAt: null,
  destination: { active: true },
  category: { active: true },
  expert: {
    verificationStatus: 'APPROVED',
    profilePublished: true,
    user: { status: 'ACTIVE', deletedAt: null },
  },
} satisfies Prisma.ProgramWhereInput;

/** 목록 카드가 필요로 하는 공개 필드만 — user PII·verificationNote 등 미포함. */
const LIST_SELECT = {
  id: true,
  slug: true,
  title: true,
  shortDescription: true,
  basePrice: true,
  currency: true,
  durationDays: true,
  sessionCount: true,
  programType: true,
  isOnline: true,
  featured: true,
  averageRating: true,
  reviewCount: true,
  destination: {
    select: {
      slug: true,
      cityNameKo: true,
      cityNameEn: true,
      countryCode: true,
      countryNameKo: true,
      countryNameEn: true,
    },
  },
  category: { select: { slug: true, nameKo: true, nameEn: true } },
  media: {
    where: { type: 'IMAGE' },
    orderBy: { sortOrder: 'asc' },
    take: 1,
    select: { url: true, altText: true },
  },
} satisfies Prisma.ProgramSelect;

type ProgramListRow = Prisma.ProgramGetPayload<{ select: typeof LIST_SELECT }>;

/**
 * visibility where + 사용자 필터(AND). 문법상 유효하나 DB에 없거나 inactive한 destination/
 * category/country는 relation 조건이 어떤 프로그램과도 매칭되지 않아 자연히 fail-closed(items:[])된다.
 */
function buildListWhere(query: ProgramListQuery): Prisma.ProgramWhereInput {
  const destination: Prisma.DestinationWhereInput = { active: true };
  if (query.country) {
    destination.countryCode = query.country;
  }
  if (query.destination) {
    destination.slug = query.destination;
  }

  const category: Prisma.CategoryWhereInput = { active: true };
  if (query.category) {
    category.slug = query.category;
  }

  return { ...PUBLIC_PROGRAM_WHERE, destination, category };
}

/** 모든 정렬은 고유 tie-breaker `id`로 끝나 정적 dataset에서 결정적 total order를 만든다. */
function buildOrderBy(sort: ProgramListQuery['sort']): Prisma.ProgramOrderByWithRelationInput[] {
  switch (sort) {
    case 'price_asc':
      return [{ basePrice: 'asc' }, { id: 'asc' }];
    case 'price_desc':
      return [{ basePrice: 'desc' }, { id: 'asc' }];
    case 'rating':
      return [{ averageRating: { sort: 'desc', nulls: 'last' } }, { id: 'asc' }];
    case 'featured':
    default:
      return [
        { featured: 'desc' },
        { averageRating: { sort: 'desc', nulls: 'last' } },
        { id: 'asc' },
      ];
  }
}

/** Prisma Decimal → JSON-safe number|null (RSC→Client 경계 직렬화 안전). */
function toSummary(row: ProgramListRow): PublicProgramSummary {
  const thumbnail = row.media[0] ?? null;
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    shortDescription: row.shortDescription,
    basePrice: row.basePrice,
    currency: row.currency,
    durationDays: row.durationDays,
    sessionCount: row.sessionCount,
    programType: row.programType,
    isOnline: row.isOnline,
    featured: row.featured,
    averageRating: row.averageRating === null ? null : Number(row.averageRating),
    reviewCount: row.reviewCount,
    destination: {
      slug: row.destination.slug,
      cityNameKo: row.destination.cityNameKo,
      cityNameEn: row.destination.cityNameEn,
      countryCode: row.destination.countryCode,
      countryNameKo: row.destination.countryNameKo,
      countryNameEn: row.destination.countryNameEn,
    },
    category: {
      slug: row.category.slug,
      nameKo: row.category.nameKo,
      nameEn: row.category.nameEn,
    },
    thumbnail: thumbnail ? { url: thumbnail.url, altText: thumbnail.altText } : null,
  };
}

/**
 * 공개 프로그램 목록 조회. count와 findMany는 개별 쿼리다(강한 snapshot consistency 미주장);
 * 정적 dataset에선 일치하고, 동시 mutation 시 total과 items가 순간 다를 수 있다(MVP 허용).
 */
export async function listPublicPrograms(
  query: ProgramListQuery,
  deps: ProgramsDeps = getDefaultProgramsDeps(),
): Promise<ProgramListResult> {
  const where = buildListWhere(query);
  const total = await deps.db.program.count({ where });
  const pagination = computePagination(total, query.page);

  const rows =
    total === 0
      ? []
      : await deps.db.program.findMany({
          where,
          orderBy: buildOrderBy(query.sort),
          skip: pagination.skip,
          take: pagination.take,
          select: LIST_SELECT,
        });

  return {
    items: rows.map(toSummary),
    page: pagination.page,
    pageSize: pagination.pageSize,
    total: pagination.total,
    totalPages: pagination.totalPages,
  };
}

/** 필터 UI용 active facet — 국가는 active Destination에서 dedupe(countryCode asc 결정적 순서). */
export async function getProgramListFacets(
  deps: ProgramsDeps = getDefaultProgramsDeps(),
): Promise<ProgramListFacets> {
  const [destinations, categories] = await Promise.all([
    deps.db.destination.findMany({
      where: { active: true },
      orderBy: [{ countryCode: 'asc' }, { sortOrder: 'asc' }],
      select: {
        slug: true,
        cityNameKo: true,
        cityNameEn: true,
        countryCode: true,
        countryNameKo: true,
        countryNameEn: true,
      },
    }),
    deps.db.category.findMany({
      where: { active: true },
      orderBy: { sortOrder: 'asc' },
      select: { slug: true, nameKo: true, nameEn: true },
    }),
  ]);

  const countryByCode = new Map<string, ProgramCountryFacet>();
  for (const destination of destinations) {
    if (!countryByCode.has(destination.countryCode)) {
      countryByCode.set(destination.countryCode, {
        code: destination.countryCode,
        nameKo: destination.countryNameKo,
        nameEn: destination.countryNameEn,
      });
    }
  }

  return {
    countries: [...countryByCode.values()],
    destinations: destinations.map((destination) => ({
      slug: destination.slug,
      cityNameKo: destination.cityNameKo,
      cityNameEn: destination.cityNameEn,
      countryCode: destination.countryCode,
    })),
    categories: categories.map((category) => ({
      slug: category.slug,
      nameKo: category.nameKo,
      nameEn: category.nameEn,
    })),
  };
}

/**
 * 상세가 필요로 하는 공개 필드 — 목록보다 넓다(fullDescription·언어·포함/불포함·편의 속성·전체
 * media·전문가 요약). expert는 공개 요약 필드만 select한다(user PII·verificationNote·
 * profilePublished·credential 등 미포함). Date 필드는 select 자체를 하지 않아 직렬화 위험이 없다.
 */
const DETAIL_SELECT = {
  id: true,
  slug: true,
  title: true,
  shortDescription: true,
  fullDescription: true,
  basePrice: true,
  currency: true,
  durationDays: true,
  sessionCount: true,
  maxParticipants: true,
  programType: true,
  bookingType: true,
  isOnline: true,
  languages: true,
  includes: true,
  excludes: true,
  requirements: true,
  meetingPoint: true,
  cancellationPolicy: true,
  petFriendly: true,
  childFriendly: true,
  accommodationIncluded: true,
  transportIncluded: true,
  averageRating: true,
  reviewCount: true,
  destination: {
    select: {
      slug: true,
      cityNameKo: true,
      cityNameEn: true,
      countryCode: true,
      countryNameKo: true,
      countryNameEn: true,
    },
  },
  category: { select: { slug: true, nameKo: true, nameEn: true } },
  // VIDEO는 2B 범위 밖 — IMAGE만. sortOrder→id로 결정적 순서.
  media: {
    where: { type: 'IMAGE' },
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    select: { id: true, type: true, url: true, altText: true, sortOrder: true },
  },
  expert: {
    select: {
      slug: true,
      displayName: true,
      bio: true,
      languages: true,
      yearsOfExperience: true,
      identityVerified: true,
      credentialVerified: true,
      responseRate: true,
      responseTimeMinutes: true,
      averageRating: true,
      reviewCount: true,
      completedBookingCount: true,
    },
  },
} satisfies Prisma.ProgramSelect;

type ProgramDetailRow = Prisma.ProgramGetPayload<{ select: typeof DETAIL_SELECT }>;

/** Prisma row → JSON-safe 상세 DTO. Decimal(program·expert averageRating) → number|null 변환. */
function toDetail(row: ProgramDetailRow): PublicProgramDetail {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    shortDescription: row.shortDescription,
    fullDescription: row.fullDescription,
    basePrice: row.basePrice,
    currency: row.currency,
    durationDays: row.durationDays,
    sessionCount: row.sessionCount,
    maxParticipants: row.maxParticipants,
    programType: row.programType,
    bookingType: row.bookingType,
    isOnline: row.isOnline,
    languages: row.languages,
    includes: row.includes,
    excludes: row.excludes,
    requirements: row.requirements,
    meetingPoint: row.meetingPoint,
    cancellationPolicy: row.cancellationPolicy,
    petFriendly: row.petFriendly,
    childFriendly: row.childFriendly,
    accommodationIncluded: row.accommodationIncluded,
    transportIncluded: row.transportIncluded,
    averageRating: row.averageRating === null ? null : Number(row.averageRating),
    reviewCount: row.reviewCount,
    destination: {
      slug: row.destination.slug,
      cityNameKo: row.destination.cityNameKo,
      cityNameEn: row.destination.cityNameEn,
      countryCode: row.destination.countryCode,
      countryNameKo: row.destination.countryNameKo,
      countryNameEn: row.destination.countryNameEn,
    },
    category: {
      slug: row.category.slug,
      nameKo: row.category.nameKo,
      nameEn: row.category.nameEn,
    },
    media: row.media
      .filter((item) => isDisplayableImageUrl(item.url))
      .map((item) => ({
        id: item.id,
        type: item.type,
        url: item.url,
        altText: item.altText,
        sortOrder: item.sortOrder,
      })),
    expert: {
      slug: row.expert.slug,
      displayName: row.expert.displayName,
      bio: row.expert.bio,
      languages: row.expert.languages,
      yearsOfExperience: row.expert.yearsOfExperience,
      identityVerified: row.expert.identityVerified,
      credentialVerified: row.expert.credentialVerified,
      responseRate: row.expert.responseRate,
      responseTimeMinutes: row.expert.responseTimeMinutes,
      averageRating: row.expert.averageRating === null ? null : Number(row.expert.averageRating),
      reviewCount: row.expert.reviewCount,
      completedBookingCount: row.expert.completedBookingCount,
    },
  };
}

/**
 * 공개 프로그램 상세(단건) 조회. 목록과 동일한 공개 계약(PUBLIC_PROGRAM_WHERE)에 slug를 AND한다.
 *
 * visibility 관계(expert 승인·게시, user 상태)는 unique 컬럼이 아니라 findUnique를 쓸 수 없고,
 * slug가 @unique이므로 findFirst가 단건 또는 null을 돌려준다(fail-closed). 존재하지 않는 slug·
 * 형식 오류·비공개(DRAFT/미승인/미게시/정지/삭제 등)는 모두 하나의 `null`로 수렴한다 — 라우트는
 * 이를 동일한 notFound()로 처리해 존재 여부·비공개 사유를 노출하지 않는다. 형식 오류 slug는
 * parseProgramSlug에서 DB 조회 없이 걸러진다.
 */
export async function getPublicProgramBySlug(
  rawSlug: string,
  deps: ProgramsDeps = getDefaultProgramsDeps(),
): Promise<PublicProgramDetail | null> {
  const slug = parseProgramSlug(rawSlug);
  if (slug === null) {
    return null;
  }

  const row = await deps.db.program.findFirst({
    where: { ...PUBLIC_PROGRAM_WHERE, slug },
    select: DETAIL_SELECT,
  });

  return row === null ? null : toDetail(row);
}
