import { isSupportedCountry } from './constants';

/**
 * TRAVELER 온보딩 완료 판정 (순수 모듈 — DB·server-only import 금지).
 *
 * 별도 완료 컬럼 없이 기존 필드로 판정하는 **단일 소스**다. dispatcher·onboarding
 * gate·service 저장 후 재판정·테스트가 모두 이 함수를 재사용한다 (조건 복제 금지).
 */

/** 완료 판정에 필요한 TravelerProfile 최소 사실 (배열 필드만). */
export interface TravelerProfileFacts {
  travelPurposes: readonly string[];
  preferredCountries: readonly string[];
  preferredCities: readonly string[];
  travelStyles: readonly string[];
}

/** 완료 판정에 필요한 User + profile 사실. */
export interface TravelerOnboardingFacts {
  fullName: string | null;
  country: string | null;
  profile: TravelerProfileFacts | null;
}

/**
 * 완료 조건 (모두 만족):
 *  1. fullName trim 후 비어있지 않음
 *  2. country가 지원 국가 목록의 유효 값
 *  3. TravelerProfile row 존재
 *  4. travelPurposes ≥ 1
 *  5. preferredCountries ≥ 1 또는 preferredCities ≥ 1
 *  6. travelStyles ≥ 1
 *
 * budgetMin/Max·groupSize·preferredLanguages·hasChildren·hasPet·accessibilityNeeds·
 * nickname·phone·timezone은 완료 필수 아님(선택/기본값).
 */
export function isTravelerOnboardingComplete(facts: TravelerOnboardingFacts): boolean {
  if (facts.fullName === null || facts.fullName.trim().length === 0) {
    return false;
  }
  if (facts.country === null || !isSupportedCountry(facts.country)) {
    return false;
  }
  const profile = facts.profile;
  if (profile === null) {
    return false;
  }
  if (profile.travelPurposes.length < 1) {
    return false;
  }
  if (profile.preferredCountries.length < 1 && profile.preferredCities.length < 1) {
    return false;
  }
  if (profile.travelStyles.length < 1) {
    return false;
  }
  return true;
}
