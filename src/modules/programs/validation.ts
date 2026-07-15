import { z } from 'zod';

import {
  COUNTRY_CODE_PATTERN,
  DEFAULT_SORT,
  PAGE_MAX,
  PROGRAM_SORTS,
  SLUG_MAX,
  SLUG_PATTERN,
} from './constants';

/**
 * 공개 목록 쿼리의 순수 형식 스키마(DB·env import 금지).
 *
 * 형식·길이·allowlist·page 문법·안전범위·반복 param(첫 값)만 검증한다. destination/
 * category/country가 실제 active row인지는 여기가 아니라 service(DB)에서 판정한다.
 * 잘못된 값은 throw하지 않고 `.catch()`로 무해화한다(정렬→기본, page→1, 형식 오류→제거).
 */

/** 반복 query parameter(string[])는 첫 값만 사용한다. */
function firstValue(raw: unknown): unknown {
  return Array.isArray(raw) ? raw[0] : raw;
}

const slugField = z
  .preprocess((raw) => {
    const first = firstValue(raw);
    return typeof first === 'string' ? first.trim().toLowerCase() : undefined;
  }, z.string().regex(SLUG_PATTERN).max(SLUG_MAX).optional())
  .catch(undefined);

const countryField = z
  .preprocess((raw) => {
    const first = firstValue(raw);
    return typeof first === 'string' ? first.trim().toUpperCase() : undefined;
  }, z.string().regex(COUNTRY_CODE_PATTERN).optional())
  .catch(undefined);

const sortField = z.preprocess(firstValue, z.enum(PROGRAM_SORTS)).catch(DEFAULT_SORT);

const pageField = z.preprocess(firstValue, z.coerce.number().int().min(1).max(PAGE_MAX)).catch(1);

/** 파서 전체 스키마 — 모든 필드가 default/catch를 가져 절대 throw하지 않는다. */
export const programListParamsSchema = z.object({
  country: countryField,
  destination: slugField,
  category: slugField,
  sort: sortField,
  page: pageField,
});

export type ProgramListParams = z.infer<typeof programListParamsSchema>;
