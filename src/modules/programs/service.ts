import 'server-only';

import { Prisma } from '@/generated/prisma/client';

import { getDefaultProgramsDeps, type ProgramsDeps } from './deps';
import { computePagination } from './query';
import type {
  ProgramListFacets,
  ProgramListQuery,
  ProgramListResult,
  ProgramCountryFacet,
  PublicProgramSummary,
} from './types';

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
