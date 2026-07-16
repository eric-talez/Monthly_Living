import type { BookingType, Currency, MediaType, ProgramType } from '@/generated/prisma/client';

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

/** 상세 media DTO — IMAGE만 노출(VIDEO는 2B 범위 밖). URL은 http(s)만 통과(media.ts). */
export interface PublicProgramMedia {
  id: string;
  type: MediaType;
  url: string;
  altText: string | null;
  sortOrder: number;
}

/**
 * 상세의 전문가 공개 요약 — 공개 가능한 필드만.
 * user email/name·verificationStatus·verificationNote·profilePublished·credential 등 관리/PII 미포함.
 */
export interface PublicExpertSummary {
  slug: string;
  displayName: string;
  bio: string;
  languages: string[]; // BCP-47
  yearsOfExperience: number;
  identityVerified: boolean;
  credentialVerified: boolean;
  responseRate: number | null; // 0~100 (%)
  responseTimeMinutes: number | null;
  averageRating: number | null; // Prisma Decimal → number|null (service 경계 변환)
  reviewCount: number;
  completedBookingCount: number;
}

/**
 * 공개 상세 DTO — 목록보다 넓은 공개 필드 + media[] + 전문가 요약.
 * JSON-safe primitive/plain object만 포함한다(Prisma Decimal → number, Date 필드는 미select).
 */
export interface PublicProgramDetail {
  id: string;
  slug: string;
  title: string;
  shortDescription: string;
  fullDescription: string;
  basePrice: number; // 정수 minor units — 표시 시 money.ts로 major 환산
  currency: Currency;
  durationDays: number;
  sessionCount: number;
  maxParticipants: number;
  programType: ProgramType;
  bookingType: BookingType; // 정보 표시용(예약 CTA 아님)
  isOnline: boolean;
  languages: string[]; // BCP-47
  includes: string[];
  excludes: string[];
  requirements: string[];
  meetingPoint: string | null;
  cancellationPolicy: string;
  petFriendly: boolean;
  childFriendly: boolean;
  accommodationIncluded: boolean;
  transportIncluded: boolean;
  averageRating: number | null; // Prisma Decimal → number|null (service 경계 변환)
  reviewCount: number;
  destination: PublicProgramDestination;
  category: PublicProgramCategory;
  media: PublicProgramMedia[];
  expert: PublicExpertSummary;
}
