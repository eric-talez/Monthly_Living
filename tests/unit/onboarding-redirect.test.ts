import { describe, expect, it } from 'vitest';

import {
  POST_LOGIN_DESTINATIONS,
  resolvePostLoginDestination,
  type PostLoginState,
} from '@/modules/onboarding/redirect';

const activeTraveler = (complete: boolean): PostLoginState => ({
  role: 'TRAVELER',
  status: 'ACTIVE',
  deletedAt: null,
  travelerOnboardingComplete: complete,
});

describe('resolvePostLoginDestination', () => {
  it('세션 없음(null)이면 LOGIN이다 (fail-closed)', () => {
    expect(resolvePostLoginDestination(null)).toBe(POST_LOGIN_DESTINATIONS.LOGIN);
  });

  it('SUSPENDED는 LOGIN이다 (fail-closed)', () => {
    expect(resolvePostLoginDestination({ ...activeTraveler(true), status: 'SUSPENDED' })).toBe(
      POST_LOGIN_DESTINATIONS.LOGIN,
    );
  });

  it('DELETED는 LOGIN이다 (fail-closed)', () => {
    expect(resolvePostLoginDestination({ ...activeTraveler(true), status: 'DELETED' })).toBe(
      POST_LOGIN_DESTINATIONS.LOGIN,
    );
  });

  it('deletedAt이 있으면(soft-deleted) LOGIN이다', () => {
    expect(resolvePostLoginDestination({ ...activeTraveler(true), deletedAt: new Date(0) })).toBe(
      POST_LOGIN_DESTINATIONS.LOGIN,
    );
  });

  it('TRAVELER 미완료는 ONBOARDING이다', () => {
    expect(resolvePostLoginDestination(activeTraveler(false))).toBe(
      POST_LOGIN_DESTINATIONS.ONBOARDING,
    );
  });

  it('TRAVELER 완료는 HOME이다', () => {
    expect(resolvePostLoginDestination(activeTraveler(true))).toBe(POST_LOGIN_DESTINATIONS.HOME);
  });

  it('EXPERT는 온보딩 미완료 값과 무관하게 HOME이다', () => {
    expect(
      resolvePostLoginDestination({
        role: 'EXPERT',
        status: 'ACTIVE',
        deletedAt: null,
        travelerOnboardingComplete: false,
      }),
    ).toBe(POST_LOGIN_DESTINATIONS.HOME);
  });

  it('ADMIN은 HOME이다', () => {
    expect(
      resolvePostLoginDestination({
        role: 'ADMIN',
        status: 'ACTIVE',
        deletedAt: null,
        travelerOnboardingComplete: false,
      }),
    ).toBe(POST_LOGIN_DESTINATIONS.HOME);
  });

  it('반환값은 항상 whitelist union 안에 있다 (임의 경로 불가)', () => {
    const all = Object.values(POST_LOGIN_DESTINATIONS);
    for (const state of [
      null,
      activeTraveler(true),
      activeTraveler(false),
      { ...activeTraveler(true), status: 'SUSPENDED' as const },
    ]) {
      expect(all).toContain(resolvePostLoginDestination(state));
    }
  });
});
