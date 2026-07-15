import { DEFAULT_SORT, PAGE_SIZE, PROGRAM_QUERY_KEYS } from './constants';
import type { ProgramListQuery } from './types';
import { programListParamsSchema } from './validation';

/**
 * 공개 목록 쿼리의 순수 파싱·정규화 + canonical 판정 — DB 무접근(unit 테스트 가능).
 * Next RSC `searchParams`(string | string[] | undefined)를 입력으로 받는다.
 */
export type RawSearchParams = Record<string, string | string[] | undefined>;

/** searchParams → 정규화된 {country,destination,category,sort,page}. 절대 throw하지 않는다. */
export function parseProgramListQuery(searchParams: RawSearchParams | undefined): ProgramListQuery {
  const result = programListParamsSchema.safeParse(searchParams ?? {});
  const parsed = result.success
    ? result.data
    : {
        country: undefined,
        destination: undefined,
        category: undefined,
        sort: DEFAULT_SORT,
        page: 1,
      };
  return {
    country: parsed.country ?? null,
    destination: parsed.destination ?? null,
    category: parsed.category ?? null,
    sort: parsed.sort,
    page: parsed.page,
  };
}

/** 정규화된 쿼리의 canonical 표현(알려진 키만, 기본값 생략, 고정 순서). */
export function toCanonicalSearchParams(query: ProgramListQuery): URLSearchParams {
  const params = new URLSearchParams();
  if (query.country) {
    params.set('country', query.country);
  }
  if (query.destination) {
    params.set('destination', query.destination);
  }
  if (query.category) {
    params.set('category', query.category);
  }
  if (query.sort !== DEFAULT_SORT) {
    params.set('sort', query.sort);
  }
  if (query.page > 1) {
    params.set('page', String(query.page));
  }
  return params;
}

/** 순서 무관 multiset 동치 비교(loop 방지 — 순서만 다르면 redirect하지 않는다). */
function searchParamsEqual(a: URLSearchParams, b: URLSearchParams): boolean {
  const toSorted = (params: URLSearchParams) =>
    [...params.entries()].map(([k, v]) => `${k}=${v}`).sort();
  const left = toSorted(a);
  const right = toSorted(b);
  return left.length === right.length && left.every((entry, i) => entry === right[i]);
}

export interface CanonicalQueryResolution {
  query: ProgramListQuery;
  /** canonical query string(알려진 키 정규화 + 알려지지 않은 키 보존). */
  canonicalSearch: string;
  /** 입력이 이미 canonical이면 true → redirect 불필요. */
  isCanonical: boolean;
}

/**
 * canonical redirect 판정 — 알려진 키는 정규화하고(잘못된 sort→기본, page→1, 형식 오류 필터
 * 제거, 반복 param→첫값), **알려지지 않은 키(utm 등)는 보존**한다. 순서만 다른 경우는 canonical로
 * 간주(loop 방지). 문법상 유효하나 DB에 없는 필터는 여기서 제거하지 않는다(service가 fail-closed).
 */
export function resolveCanonicalQuery(
  searchParams: RawSearchParams | undefined,
): CanonicalQueryResolution {
  const query = parseProgramListQuery(searchParams);
  const known = new Set<string>(PROGRAM_QUERY_KEYS);

  const incoming = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams ?? {})) {
    if (value === undefined) {
      continue;
    }
    for (const item of Array.isArray(value) ? value : [value]) {
      incoming.append(key, item);
    }
  }

  const canonical = new URLSearchParams();
  for (const [key, value] of toCanonicalSearchParams(query).entries()) {
    canonical.append(key, value);
  }
  for (const [key, value] of incoming.entries()) {
    if (!known.has(key)) {
      canonical.append(key, value);
    }
  }

  return {
    query,
    canonicalSearch: canonical.toString(),
    isCanonical: searchParamsEqual(incoming, canonical),
  };
}

/**
 * UI 컨트롤이 이동할 canonical href를 만든다(pathname + 정규화 query).
 * patch로 변경 필드를 덮어쓴다(필터/정렬 변경 시 호출자가 `page: 1`을 함께 넘긴다).
 */
export function buildListHref(
  pathname: string,
  query: ProgramListQuery,
  patch: Partial<ProgramListQuery>,
): string {
  const search = toCanonicalSearchParams({ ...query, ...patch }).toString();
  return search ? `${pathname}?${search}` : pathname;
}

/** offset pagination — total===0 → totalPages 0, page 1, items []. */
export function computePagination(
  total: number,
  page: number,
): {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  skip: number;
  take: number;
} {
  const totalPages = total === 0 ? 0 : Math.ceil(total / PAGE_SIZE);
  return {
    page: total === 0 ? 1 : page,
    pageSize: PAGE_SIZE,
    total,
    totalPages,
    skip: total === 0 ? 0 : (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  };
}
