/**
 * 공개 프로그램 목록 순수 상수 — DB·env import 금지(unit 테스트 가능).
 * 정렬 allowlist·페이지 크기·안전 상한·쿼리 키·형식 한계를 한곳에 고정한다.
 */

/** 허용 정렬값(allowlist). 첫 값이 기본. "최신순"은 인덱스 확인 전까지 미노출(2A 범위 밖). */
export const PROGRAM_SORTS = ['featured', 'price_asc', 'price_desc', 'rating'] as const;
export type ProgramSort = (typeof PROGRAM_SORTS)[number];
export const DEFAULT_SORT: ProgramSort = 'featured';

/** 페이지당 항목 수(서버 상수 — 사용자 미제어). */
export const PAGE_SIZE = 12;
/** page 안전 상한 — skip=(page-1)*PAGE_SIZE overflow/남용 방지. 초과·비정상은 1로 정규화. */
export const PAGE_MAX = 1_000;

/** 파서가 다루는 알려진 쿼리 키. 그 외 키는 canonical redirect에서 보존한다. */
export const PROGRAM_QUERY_KEYS = ['country', 'destination', 'category', 'sort', 'page'] as const;
export type ProgramQueryKey = (typeof PROGRAM_QUERY_KEYS)[number];

/** slug 형식 한계(형식·길이만 — 실제 존재/active 여부는 service가 판정). */
export const SLUG_PATTERN = /^[a-z0-9-]+$/;
export const SLUG_MAX = 64;

/** country는 ISO 3166-1 alpha-2 형식만(대문자 2자). */
export const COUNTRY_CODE_PATTERN = /^[A-Z]{2}$/;
