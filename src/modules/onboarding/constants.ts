/**
 * 온보딩 curated 화이트리스트·상한 (순수 모듈 — DB·env·server-only import 금지).
 *
 * 자유 입력 필드의 값 도메인을 코드에서 고정한다. server validation이 최종 권위이며,
 * slug류(travelPurposes/preferredCountries/preferredCities)는 여기 상수가 아니라
 * active DB row로 검증한다 (modules/onboarding/service.ts).
 */

import type { Currency } from '@/generated/prisma/client';

/**
 * 온보딩에서 선택 가능한 통화 — Prisma Currency enum의 부분집합.
 * `satisfies`로 오타·drift를 컴파일 타임에 잡는다.
 */
export const SUPPORTED_CURRENCIES = [
  'KRW',
  'USD',
  'THB',
  'VND',
] as const satisfies readonly Currency[];
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

/**
 * 거주 국가 curated allow-list (ISO 3166-1 alpha-2).
 * 서비스가 지원하는 여행 대상국(Destination.countryCode)과는 분리된 목록이다 —
 * 사용자의 거주지는 대상국과 다를 수 있다. 필요 시 소폭 확장한다.
 */
export const SUPPORTED_COUNTRIES = ['KR', 'US', 'CA', 'TH', 'VN'] as const;
export type SupportedCountry = (typeof SUPPORTED_COUNTRIES)[number];

/**
 * 국가별 허용 IANA timezone. 선택한 country에 소속된 값만 timezone으로 허용한다
 * (country ↔ timezone 교차 검증). 전 IANA를 허용하지 않는다.
 */
export const SUPPORTED_COUNTRY_TIMEZONES = {
  KR: ['Asia/Seoul'],
  US: ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles'],
  CA: ['America/Toronto', 'America/Vancouver', 'America/Edmonton', 'America/Halifax'],
  TH: ['Asia/Bangkok'],
  VN: ['Asia/Ho_Chi_Minh'],
} as const satisfies Record<SupportedCountry, readonly string[]>;

/** 여행 스타일 태그 curated enum (TravelerProfile.travelStyles). 확장 가능. */
export const TRAVEL_STYLES = [
  'nature',
  'city',
  'beach',
  'culture',
  'food',
  'wellness',
  'adventure',
  'quiet',
  'social',
  'budget',
  'luxury',
  'remote-work',
  'family',
  'flexible',
] as const;
export type TravelStyle = (typeof TRAVEL_STYLES)[number];

/** 선호 언어 curated BCP-47 subset (TravelerProfile.preferredLanguages — 선택 필드). */
export const PREFERRED_LANGUAGES = ['ko', 'en', 'ja', 'zh', 'th', 'vi'] as const;
export type PreferredLanguage = (typeof PREFERRED_LANGUAGES)[number];

/** 길이·개수·범위 상한 (자유 입력 남용 방지). */
export const ONBOARDING_LIMITS = {
  FULLNAME_MAX: 80,
  NICKNAME_MAX: 40,
  PHONE_MAX: 30,
  ACCESSIBILITY_MAX: 500,
  PURPOSES_MAX: 8,
  COUNTRIES_MAX: 10,
  CITIES_MAX: 15,
  STYLES_MAX: 6,
  LANGS_MAX: 5,
  GROUP_SIZE_MIN: 1,
  GROUP_SIZE_MAX: 20,
  BUDGET_MAX: 1_000_000_000, // minor units 상한 (예: 10억 KRW)
} as const;

export function isSupportedCountry(value: string): value is SupportedCountry {
  return (SUPPORTED_COUNTRIES as readonly string[]).includes(value);
}

/** country가 지원 목록이고 timezone이 그 country에 허용된 값인지 (교차 검증). */
export function isSupportedTimezoneForCountry(country: string, timezone: string): boolean {
  if (!isSupportedCountry(country)) {
    return false;
  }
  return (SUPPORTED_COUNTRY_TIMEZONES[country] as readonly string[]).includes(timezone);
}

export function isTravelStyle(value: string): value is TravelStyle {
  return (TRAVEL_STYLES as readonly string[]).includes(value);
}

export function isPreferredLanguage(value: string): value is PreferredLanguage {
  return (PREFERRED_LANGUAGES as readonly string[]).includes(value);
}
