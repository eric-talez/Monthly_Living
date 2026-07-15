import type { Currency, ProgramType } from '@/generated/prisma/client';

import type { ProgramSort } from './constants';

/**
 * 공개 프로그램 목록의 순수 타입 — 파서 출력·목록 DTO·facet DTO.
 * DTO는 JSON-safe primitive/plain object만 포함한다(Prisma Decimal/Date 미포함).
 */

/** 파서가 정규화한 목록 쿼리. destination/category/country의 실제 존재는 service가 판정. */
export interface ProgramListQuery {
  country: string | null;
  destination: string | null;
  category: string | null;
  sort: ProgramSort;
  page: number;
}

export interface PublicProgramDestination {
  slug: string;
  cityNameKo: string;
  cityNameEn: string;
  countryCode: string;
  countryNameKo: string;
  countryNameEn: string;
}

export interface PublicProgramCategory {
  slug: string;
  nameKo: string;
  nameEn: string;
}

export interface PublicProgramThumbnail {
  url: string;
  altText: string | null;
}

/** 목록 카드 DTO — 공개 필드만. expert PII·verificationNote 등 관리 필드 미포함. */
export interface PublicProgramSummary {
  id: string;
  slug: string;
  title: string;
  shortDescription: string;
  basePrice: number; // 정수 minor units — 표시 시 통화별 지수로 major 환산(money.ts)
  currency: Currency;
  durationDays: number;
  sessionCount: number;
  programType: ProgramType;
  isOnline: boolean;
  featured: boolean;
  averageRating: number | null; // Prisma Decimal → number|null (service 경계 변환)
  reviewCount: number;
  destination: PublicProgramDestination;
  category: PublicProgramCategory;
  thumbnail: PublicProgramThumbnail | null;
}

export interface ProgramListResult {
  items: PublicProgramSummary[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number; // total===0 → 0
}

export interface ProgramCountryFacet {
  code: string;
  nameKo: string;
  nameEn: string;
}

export interface ProgramDestinationFacet {
  slug: string;
  cityNameKo: string;
  cityNameEn: string;
  countryCode: string;
}

export interface ProgramCategoryFacet {
  slug: string;
  nameKo: string;
  nameEn: string;
}

/** 필터 UI가 렌더할 active facet — DTO는 Ko/En 양쪽 보유(표시 시 locale 선택). */
export interface ProgramListFacets {
  countries: ProgramCountryFacet[];
  destinations: ProgramDestinationFacet[];
  categories: ProgramCategoryFacet[];
}
