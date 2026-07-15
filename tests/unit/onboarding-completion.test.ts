import { describe, expect, it } from 'vitest';

import {
  isTravelerOnboardingComplete,
  type TravelerOnboardingFacts,
  type TravelerProfileFacts,
} from '@/modules/onboarding/completion';

const completeProfile: TravelerProfileFacts = {
  travelPurposes: ['fitness', 'remote-work'],
  preferredCountries: ['KR', 'TH'],
  preferredCities: ['jeju', 'chiang-mai'],
  travelStyles: ['nature', 'quiet'],
};

const completeFacts: TravelerOnboardingFacts = {
  fullName: '김여행',
  country: 'KR',
  profile: completeProfile,
};

describe('isTravelerOnboardingComplete', () => {
  it('핵심 5종을 모두 갖춘 traveler는 완료다 (seed 동등)', () => {
    expect(isTravelerOnboardingComplete(completeFacts)).toBe(true);
  });

  it('fullName이 null이면 미완료다', () => {
    expect(isTravelerOnboardingComplete({ ...completeFacts, fullName: null })).toBe(false);
  });

  it('fullName이 공백만이면 미완료다', () => {
    expect(isTravelerOnboardingComplete({ ...completeFacts, fullName: '   ' })).toBe(false);
  });

  it('country가 null이면 미완료다', () => {
    expect(isTravelerOnboardingComplete({ ...completeFacts, country: null })).toBe(false);
  });

  it('country가 지원 목록 밖(예: JP)이면 미완료다', () => {
    expect(isTravelerOnboardingComplete({ ...completeFacts, country: 'JP' })).toBe(false);
  });

  it('TravelerProfile row가 없으면 미완료다', () => {
    expect(isTravelerOnboardingComplete({ ...completeFacts, profile: null })).toBe(false);
  });

  it('travelPurposes가 비면 미완료다', () => {
    expect(
      isTravelerOnboardingComplete({
        ...completeFacts,
        profile: { ...completeProfile, travelPurposes: [] },
      }),
    ).toBe(false);
  });

  it('preferredCountries·preferredCities가 둘 다 비면 미완료다', () => {
    expect(
      isTravelerOnboardingComplete({
        ...completeFacts,
        profile: { ...completeProfile, preferredCountries: [], preferredCities: [] },
      }),
    ).toBe(false);
  });

  it('preferredCities만 있어도(국가 비어도) destination 관심 조건은 충족한다', () => {
    expect(
      isTravelerOnboardingComplete({
        ...completeFacts,
        profile: { ...completeProfile, preferredCountries: [], preferredCities: ['jeju'] },
      }),
    ).toBe(true);
  });

  it('preferredCountries만 있어도 destination 관심 조건은 충족한다', () => {
    expect(
      isTravelerOnboardingComplete({
        ...completeFacts,
        profile: { ...completeProfile, preferredCountries: ['KR'], preferredCities: [] },
      }),
    ).toBe(true);
  });

  it('travelStyles가 비면 미완료다', () => {
    expect(
      isTravelerOnboardingComplete({
        ...completeFacts,
        profile: { ...completeProfile, travelStyles: [] },
      }),
    ).toBe(false);
  });
});
