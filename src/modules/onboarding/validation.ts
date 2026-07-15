import { z } from 'zod';

import { routing } from '@/i18n/routing';

import {
  ONBOARDING_LIMITS,
  PREFERRED_LANGUAGES,
  SUPPORTED_COUNTRIES,
  SUPPORTED_CURRENCIES,
  TRAVEL_STYLES,
  isSupportedTimezoneForCountry,
} from './constants';

/**
 * 온보딩 입력 스키마 (순수 모듈 — DB·env import 금지).
 *
 * 형식·길이·범위·enum 소속과 배열 최소/최대/중복제거를 검증한다. slug 존재(active)
 * 검증은 여기가 아니라 service(DB)에서 한다. UI 검증은 편의이고 **이 server validation이
 * 최종 권위**다. 오류 message는 사람이 읽는 문장이 아니라 i18n 키
 * (`onboarding.validation.*`)이며 UI가 번역해 표시한다.
 */

const L = ONBOARDING_LIMITS;

/** FormData.getAll → trim·빈값 제거·중복 제거된 string[]. */
function cleanStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const seen = new Set<string>();
  for (const value of raw) {
    if (typeof value !== 'string') {
      continue;
    }
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      seen.add(trimmed);
    }
  }
  return Array.from(seen);
}

/** 선택 텍스트: 빈 문자열·null → undefined (optional 처리). */
function emptyToUndefined(raw: unknown): unknown {
  if (raw === null || (typeof raw === 'string' && raw.trim().length === 0)) {
    return undefined;
  }
  return raw;
}

const optionalText = (max: number, tooLongKey: string) =>
  z.preprocess(emptyToUndefined, z.string().trim().max(max, tooLongKey).optional());

const optionalInt = (min: number, max: number, invalidKey: string) =>
  z.preprocess(
    emptyToUndefined,
    z.coerce
      .number(invalidKey)
      .int(invalidKey)
      .min(min, invalidKey)
      .max(max, invalidKey)
      .optional(),
  );

export const onboardingSchema = z
  .object({
    // ── 필수 (핵심 5종의 identity 부분) ──
    fullName: z.string('required').trim().min(1, 'required').max(L.FULLNAME_MAX, 'fullNameTooLong'),
    country: z.enum(SUPPORTED_COUNTRIES, 'countryInvalid'),
    timezone: z.string('required').trim().min(1, 'required'),
    preferredLanguage: z.enum(routing.locales, 'localeInvalid'),
    preferredCurrency: z.enum(SUPPORTED_CURRENCIES, 'currencyInvalid'),

    // ── 필수 (핵심 5종의 선호 부분) ──
    travelPurposes: z.preprocess(
      cleanStringArray,
      z.array(z.string()).min(1, 'purposesRequired').max(L.PURPOSES_MAX, 'purposesTooMany'),
    ),
    preferredCountries: z.preprocess(
      cleanStringArray,
      z.array(z.string()).max(L.COUNTRIES_MAX, 'countriesTooMany'),
    ),
    preferredCities: z.preprocess(
      cleanStringArray,
      z.array(z.string()).max(L.CITIES_MAX, 'citiesTooMany'),
    ),
    travelStyles: z.preprocess(
      cleanStringArray,
      z
        .array(z.enum(TRAVEL_STYLES, 'styleInvalid'))
        .min(1, 'stylesRequired')
        .max(L.STYLES_MAX, 'stylesTooMany'),
    ),

    // ── 선택 (추천 품질용) ──
    preferredLanguages: z.preprocess(
      cleanStringArray,
      z.array(z.enum(PREFERRED_LANGUAGES, 'languageInvalid')).max(L.LANGS_MAX, 'languagesTooMany'),
    ),
    nickname: optionalText(L.NICKNAME_MAX, 'nicknameTooLong'),
    phone: z.preprocess(
      emptyToUndefined,
      z
        .string()
        .trim()
        .max(L.PHONE_MAX, 'phoneTooLong')
        .refine((value) => /^[0-9+\-()\s]+$/.test(value), 'phoneInvalid')
        .optional(),
    ),
    budgetMin: optionalInt(0, L.BUDGET_MAX, 'budgetInvalid'),
    budgetMax: optionalInt(0, L.BUDGET_MAX, 'budgetInvalid'),
    groupSize: optionalInt(L.GROUP_SIZE_MIN, L.GROUP_SIZE_MAX, 'groupSizeInvalid'),
    hasChildren: z.boolean().default(false),
    hasPet: z.boolean().default(false),
    accessibilityNeeds: optionalText(L.ACCESSIBILITY_MAX, 'accessibilityTooLong'),
  })
  // timezone은 선택 country에 허용된 값이어야 한다 (교차 검증)
  .refine((v) => isSupportedTimezoneForCountry(v.country, v.timezone), {
    message: 'timezoneInvalid',
    path: ['timezone'],
  })
  // 목적지 관심: 국가·도시 중 최소 하나
  .refine((v) => v.preferredCountries.length + v.preferredCities.length >= 1, {
    message: 'destinationRequired',
    path: ['preferredCities'],
  })
  // budget 둘 다 있으면 min ≤ max
  .refine(
    (v) => v.budgetMin === undefined || v.budgetMax === undefined || v.budgetMin <= v.budgetMax,
    {
      message: 'budgetRange',
      path: ['budgetMax'],
    },
  );

export type OnboardingInput = z.infer<typeof onboardingSchema>;

/**
 * UI가 `onboarding.validation.*`에서 번역할 수 있는 키 목록 — 스키마 message +
 * service의 slug 검증 실패(purposeUnknown/countryUnavailable/cityUnavailable)와 1:1.
 */
export const ONBOARDING_VALIDATION_MESSAGE_KEYS = [
  'required',
  'fullNameTooLong',
  'countryInvalid',
  'timezoneInvalid',
  'localeInvalid',
  'currencyInvalid',
  'purposesRequired',
  'purposesTooMany',
  'purposeUnknown',
  'destinationRequired',
  'countriesTooMany',
  'citiesTooMany',
  'countryUnavailable',
  'cityUnavailable',
  'stylesRequired',
  'stylesTooMany',
  'styleInvalid',
  'languagesTooMany',
  'languageInvalid',
  'nicknameTooLong',
  'phoneInvalid',
  'phoneTooLong',
  'budgetInvalid',
  'budgetRange',
  'groupSizeInvalid',
  'accessibilityTooLong',
] as const;

export type OnboardingValidationMessageKey = (typeof ONBOARDING_VALIDATION_MESSAGE_KEYS)[number];

/** 알 수 없는 message(라이브러리 기본 문구 등)는 required로 안전하게 수렴시킨다. */
export function toOnboardingValidationKey(message: string): OnboardingValidationMessageKey {
  return (ONBOARDING_VALIDATION_MESSAGE_KEYS as readonly string[]).includes(message)
    ? (message as OnboardingValidationMessageKey)
    : 'required';
}
