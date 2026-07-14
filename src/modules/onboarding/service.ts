import 'server-only';

import { routing } from '@/i18n/routing';

import {
  PREFERRED_LANGUAGES,
  SUPPORTED_COUNTRIES,
  SUPPORTED_COUNTRY_TIMEZONES,
  SUPPORTED_CURRENCIES,
  TRAVEL_STYLES,
  type PreferredLanguage,
  type SupportedCountry,
  type SupportedCurrency,
  type TravelStyle,
} from './constants';
import { isTravelerOnboardingComplete } from './completion';
import { getDefaultOnboardingDeps, type OnboardingDeps } from './deps';
import {
  resolvePostLoginDestination,
  type PostLoginDestination,
  type PostLoginState,
} from './redirect';
import type { OnboardingInput, OnboardingValidationMessageKey } from './validation';

/**
 * 온보딩 DB 경계 — 상태 로드·목적지 판정·폼 옵션·저장(트랜잭션)을 담당한다.
 * page/action은 세션 userId만 신뢰하고 여기에 위임한다. slug류(travelPurposes/
 * preferredCountries/preferredCities)는 active DB row로 검증한다.
 */

/** 완료 재판정 실패(방어선) — Zod를 통과했다면 도달하지 않아야 한다. */
class OnboardingIncompleteError extends Error {}

// ── 상태 로드 · 목적지 판정 (dispatcher·gate 공용) ─────────────────────

/** userId로 DB 상태를 로드해 완료 여부까지 계산한다. 사용자 없으면 null. */
export async function loadPostLoginState(
  userId: string,
  deps: OnboardingDeps = getDefaultOnboardingDeps(),
): Promise<PostLoginState | null> {
  const user = await deps.db.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      status: true,
      deletedAt: true,
      fullName: true,
      country: true,
      travelerProfile: {
        select: {
          travelPurposes: true,
          preferredCountries: true,
          preferredCities: true,
          travelStyles: true,
        },
      },
    },
  });
  if (!user) {
    return null;
  }
  return {
    role: user.role,
    status: user.status,
    deletedAt: user.deletedAt,
    travelerOnboardingComplete: isTravelerOnboardingComplete({
      fullName: user.fullName,
      country: user.country,
      profile: user.travelerProfile,
    }),
  };
}

/** dispatcher·onboarding gate 공용 — 세션 userId의 최종 목적지. */
export async function resolvePostLoginDestinationForUser(
  userId: string,
  deps: OnboardingDeps = getDefaultOnboardingDeps(),
): Promise<PostLoginDestination> {
  return resolvePostLoginDestination(await loadPostLoginState(userId, deps));
}

// ── 폼 옵션 · prefill ────────────────────────────────────────────────

export interface OnboardingCategoryOption {
  slug: string;
  nameKo: string;
  nameEn: string;
}
export interface OnboardingDestinationOption {
  slug: string;
  countryCode: string;
  countryNameKo: string;
  countryNameEn: string;
  cityNameKo: string;
  cityNameEn: string;
}

export interface OnboardingFormOptions {
  countries: readonly SupportedCountry[];
  countryTimezones: typeof SUPPORTED_COUNTRY_TIMEZONES;
  currencies: readonly SupportedCurrency[];
  locales: typeof routing.locales;
  travelStyles: readonly TravelStyle[];
  preferredLanguages: readonly PreferredLanguage[];
  categories: OnboardingCategoryOption[];
  destinations: OnboardingDestinationOption[];
}

/** 폼이 렌더할 옵션 — curated 상수 + active Category/Destination. */
export async function getOnboardingFormOptions(
  deps: OnboardingDeps = getDefaultOnboardingDeps(),
): Promise<OnboardingFormOptions> {
  const [categories, destinations] = await Promise.all([
    deps.db.category.findMany({
      where: { active: true },
      orderBy: { sortOrder: 'asc' },
      select: { slug: true, nameKo: true, nameEn: true },
    }),
    deps.db.destination.findMany({
      where: { active: true },
      orderBy: [{ countryCode: 'asc' }, { sortOrder: 'asc' }],
      select: {
        slug: true,
        countryCode: true,
        countryNameKo: true,
        countryNameEn: true,
        cityNameKo: true,
        cityNameEn: true,
      },
    }),
  ]);
  return {
    countries: SUPPORTED_COUNTRIES,
    countryTimezones: SUPPORTED_COUNTRY_TIMEZONES,
    currencies: SUPPORTED_CURRENCIES,
    locales: routing.locales,
    travelStyles: TRAVEL_STYLES,
    preferredLanguages: PREFERRED_LANGUAGES,
    categories,
    destinations,
  };
}

export interface OnboardingDraft {
  fullName: string;
  nickname: string;
  phone: string;
  country: string;
  timezone: string;
  preferredLanguage: string;
  preferredCurrency: string;
  travelPurposes: string[];
  preferredCountries: string[];
  preferredCities: string[];
  travelStyles: string[];
  preferredLanguages: string[];
  budgetMin: number | null;
  budgetMax: number | null;
  groupSize: number;
  hasChildren: boolean;
  hasPet: boolean;
  accessibilityNeeds: string;
}

/** 폼 prefill용 현재 값. fullName은 없으면 Auth.js 표시명(name)으로 편의 채움. */
export async function loadOnboardingDraft(
  userId: string,
  deps: OnboardingDeps = getDefaultOnboardingDeps(),
): Promise<OnboardingDraft | null> {
  const user = await deps.db.user.findUnique({
    where: { id: userId },
    select: {
      name: true,
      fullName: true,
      nickname: true,
      phone: true,
      country: true,
      timezone: true,
      preferredLanguage: true,
      preferredCurrency: true,
      travelerProfile: true,
    },
  });
  if (!user) {
    return null;
  }
  const p = user.travelerProfile;
  return {
    fullName: user.fullName ?? user.name ?? '',
    nickname: user.nickname ?? '',
    phone: user.phone ?? '',
    country: user.country ?? '',
    timezone: user.timezone,
    preferredLanguage: user.preferredLanguage,
    preferredCurrency: user.preferredCurrency,
    travelPurposes: p?.travelPurposes ?? [],
    preferredCountries: p?.preferredCountries ?? [],
    preferredCities: p?.preferredCities ?? [],
    travelStyles: p?.travelStyles ?? [],
    preferredLanguages: p?.preferredLanguages ?? [],
    budgetMin: p?.budgetMin ?? null,
    budgetMax: p?.budgetMax ?? null,
    groupSize: p?.groupSize ?? 1,
    hasChildren: p?.hasChildren ?? false,
    hasPet: p?.hasPet ?? false,
    accessibilityNeeds: p?.accessibilityNeeds ?? '',
  };
}

// ── 저장 (트랜잭션) ──────────────────────────────────────────────────

export type CompleteOnboardingResult =
  | { ok: true }
  | { ok: false; reason: 'not-authorized' }
  | { ok: false; reason: 'invalid'; fieldErrors: Record<string, OnboardingValidationMessageKey> };

/** 테스트 전용 실패 주입 지점 — transaction 내부에서 실행되어 throw 시 전체 rollback. */
export interface OnboardingHooks {
  /** User.update 이후 · TravelerProfile.upsert 이전 */
  beforeProfileUpsert?: () => void | Promise<void>;
}

/**
 * TRAVELER 온보딩 저장 — User update + TravelerProfile upsert를 단일 트랜잭션으로.
 * userId는 세션에서만 오며(타 사용자 수정 불가), 대상 User row를 FOR UPDATE로 잠가
 * 동시 submit을 직렬화한다. active slug 검증 실패·완료 재판정 실패는 전체 rollback.
 */
export async function completeTravelerOnboarding(
  params: { userId: string; input: OnboardingInput },
  deps: OnboardingDeps = getDefaultOnboardingDeps(),
  hooks?: OnboardingHooks,
): Promise<CompleteOnboardingResult> {
  const { userId, input } = params;

  try {
    return await deps.db.$transaction(async (tx) => {
      // (3) 유일 직렬화 지점 — 동일 사용자 동시 submit 방지 (account-deletion과 동일 잠금)
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;

      // (4) 잠금 아래 재검증 — ACTIVE TRAVELER, soft-delete 아님
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { role: true, status: true, deletedAt: true },
      });
      if (
        !user ||
        user.status !== 'ACTIVE' ||
        user.deletedAt !== null ||
        user.role !== 'TRAVELER'
      ) {
        return { ok: false, reason: 'not-authorized' };
      }

      // (5)(6) slug류는 active DB row로 검증 — 불활성/미존재는 field error로 rollback
      const fieldErrors: Record<string, OnboardingValidationMessageKey> = {};

      const categories = await tx.category.findMany({
        where: { slug: { in: input.travelPurposes }, active: true },
        select: { slug: true },
      });
      const activeCategorySlugs = new Set(categories.map((c) => c.slug));
      if (input.travelPurposes.some((slug) => !activeCategorySlugs.has(slug))) {
        fieldErrors.travelPurposes = 'purposeUnknown';
      }

      if (input.preferredCities.length > 0) {
        const cityRows = await tx.destination.findMany({
          where: { slug: { in: input.preferredCities }, active: true },
          select: { slug: true },
        });
        const activeCitySlugs = new Set(cityRows.map((d) => d.slug));
        if (input.preferredCities.some((slug) => !activeCitySlugs.has(slug))) {
          fieldErrors.preferredCities = 'cityUnavailable';
        }
      }

      if (input.preferredCountries.length > 0) {
        const countryRows = await tx.destination.findMany({
          where: { countryCode: { in: input.preferredCountries }, active: true },
          select: { countryCode: true },
        });
        const activeCountryCodes = new Set(countryRows.map((d) => d.countryCode));
        if (input.preferredCountries.some((code) => !activeCountryCodes.has(code))) {
          fieldErrors.preferredCountries = 'countryUnavailable';
        }
      }

      if (Object.keys(fieldErrors).length > 0) {
        return { ok: false, reason: 'invalid', fieldErrors };
      }

      // (7) User 식별·환경 필드
      await tx.user.update({
        where: { id: userId },
        data: {
          fullName: input.fullName,
          country: input.country,
          timezone: input.timezone,
          preferredLanguage: input.preferredLanguage,
          preferredCurrency: input.preferredCurrency,
          nickname: input.nickname ?? null,
          phone: input.phone ?? null,
        },
      });

      await hooks?.beforeProfileUpsert?.();

      // (8) TravelerProfile upsert (userId unique — 중복 row 불가)
      const profileData = {
        travelPurposes: input.travelPurposes,
        preferredCountries: input.preferredCountries,
        preferredCities: input.preferredCities,
        travelStyles: input.travelStyles,
        preferredLanguages: input.preferredLanguages,
        budgetMin: input.budgetMin ?? null,
        budgetMax: input.budgetMax ?? null,
        budgetCurrency: input.preferredCurrency,
        groupSize: input.groupSize ?? 1,
        hasChildren: input.hasChildren,
        hasPet: input.hasPet,
        accessibilityNeeds: input.accessibilityNeeds ?? null,
      };
      await tx.travelerProfile.upsert({
        where: { userId },
        create: { userId, ...profileData },
        update: profileData,
      });

      // (9)(10) 완료 재판정 — 미완료면 전체 rollback (방어선)
      const complete = isTravelerOnboardingComplete({
        fullName: input.fullName,
        country: input.country,
        profile: {
          travelPurposes: input.travelPurposes,
          preferredCountries: input.preferredCountries,
          preferredCities: input.preferredCities,
          travelStyles: input.travelStyles,
        },
      });
      if (!complete) {
        throw new OnboardingIncompleteError();
      }

      // (11) commit
      return { ok: true };
    });
  } catch (error) {
    if (error instanceof OnboardingIncompleteError) {
      return { ok: false, reason: 'invalid', fieldErrors: {} };
    }
    // 인프라 오류 — 이미 rollback됐다. 호출자가 일반화한다 (로그에 입력 body 미기록).
    throw error;
  }
}
