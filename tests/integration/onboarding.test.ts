import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { POST_LOGIN_DESTINATIONS } from '@/modules/onboarding/redirect';
import {
  completeTravelerOnboarding,
  loadPostLoginState,
  resolvePostLoginDestinationForUser,
} from '@/modules/onboarding/service';
import type { OnboardingInput } from '@/modules/onboarding/validation';
import { ensureOAuthIdentity } from '@/modules/auth/oauth-identity';

import { cleanupOwnData, disconnect, runId, testEmail, testPrisma } from './helpers/db';
import { createRegisteredUser } from './helpers/users';

const deps = { db: testPrisma };

// runId prefix로 만드는 test catalog (cleanup은 slug prefix로) — test DB는 seed가 없다
const CAT_FITNESS = `${runId}-cat-fitness`;
const CAT_REMOTE = `${runId}-cat-remote`;
const CITY_JEJU = `${runId}-city-jeju`;
const DEST_COUNTRY = 'KR';

async function userIdByEmail(email: string): Promise<string> {
  const user = await testPrisma.user.findUniqueOrThrow({ where: { email }, select: { id: true } });
  return user.id;
}

/** 유효한 최소 온보딩 입력(핵심 5종) — 각 테스트에서 override. */
function serviceInput(overrides: Partial<OnboardingInput> = {}): OnboardingInput {
  const base: OnboardingInput = {
    fullName: '김여행',
    country: 'KR',
    timezone: 'Asia/Seoul',
    preferredLanguage: 'ko',
    preferredCurrency: 'KRW',
    travelPurposes: [CAT_FITNESS],
    preferredCountries: [],
    preferredCities: [CITY_JEJU],
    travelStyles: ['nature'],
    preferredLanguages: [],
    hasChildren: false,
    hasPet: false,
  };
  return { ...base, ...overrides };
}

beforeAll(async () => {
  await testPrisma.category.createMany({
    data: [
      { slug: CAT_FITNESS, nameKo: '피트니스', nameEn: 'Fitness', active: true },
      { slug: CAT_REMOTE, nameKo: '원격근무', nameEn: 'Remote work', active: true },
    ],
  });
  await testPrisma.destination.create({
    data: {
      slug: CITY_JEJU,
      countryCode: DEST_COUNTRY,
      countryNameKo: '한국',
      countryNameEn: 'Korea',
      cityNameKo: '제주',
      cityNameEn: 'Jeju',
      latitude: 33.4996,
      longitude: 126.5312,
      timezone: 'Asia/Seoul',
      currency: 'KRW',
      active: true,
    },
  });
});

afterAll(async () => {
  await testPrisma.destination.deleteMany({ where: { slug: { startsWith: `${runId}-` } } });
  await testPrisma.category.deleteMany({ where: { slug: { startsWith: `${runId}-` } } });
  await cleanupOwnData();
  await disconnect();
});

describe('온보딩 목적지 판정 (dispatcher/gate 공용)', () => {
  it('신규 Credentials traveler는 미완료 → ONBOARDING', async () => {
    const { email } = await createRegisteredUser('onb-cred-new');
    const userId = await userIdByEmail(email);
    expect(await resolvePostLoginDestinationForUser(userId, deps)).toBe(
      POST_LOGIN_DESTINATIONS.ONBOARDING,
    );
  });

  it('신규 Google traveler(OAuth 생성)는 미완료 → ONBOARDING', async () => {
    const email = testEmail('onb-google-new');
    const result = await ensureOAuthIdentity(
      {
        providerId: 'google',
        providerAccountType: 'oidc',
        providerAccountId: `${runId}-g-onb`,
        email,
        name: 'Google 사용자',
        locale: 'ko',
        hasAuthSessionCookie: false,
      },
      deps,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(await resolvePostLoginDestinationForUser(result.userId, deps)).toBe(
      POST_LOGIN_DESTINATIONS.ONBOARDING,
    );
  });

  it('신규 Kakao traveler(OAuth 생성)는 미완료 → ONBOARDING', async () => {
    const email = testEmail('onb-kakao-new');
    const result = await ensureOAuthIdentity(
      {
        providerId: 'kakao',
        providerAccountType: 'oauth',
        providerAccountId: `${runId}-k-onb`,
        email,
        name: 'Kakao 사용자',
        locale: 'ko',
        hasAuthSessionCookie: false,
      },
      deps,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(await resolvePostLoginDestinationForUser(result.userId, deps)).toBe(
      POST_LOGIN_DESTINATIONS.ONBOARDING,
    );
  });

  it('seed 동등(완전 프로필) traveler는 완료로 판정된다', async () => {
    const { email } = await createRegisteredUser('onb-seedlike');
    const userId = await userIdByEmail(email);
    await testPrisma.user.update({
      where: { id: userId },
      data: { fullName: '김여행', country: 'KR' },
    });
    await testPrisma.travelerProfile.create({
      data: {
        userId,
        travelPurposes: [CAT_FITNESS, CAT_REMOTE],
        preferredCountries: ['KR'],
        preferredCities: [CITY_JEJU],
        travelStyles: ['nature', 'quiet'],
        preferredLanguages: ['ko', 'en'],
      },
    });
    const state = await loadPostLoginState(userId, deps);
    expect(state?.travelerOnboardingComplete).toBe(true);
    expect(await resolvePostLoginDestinationForUser(userId, deps)).toBe(
      POST_LOGIN_DESTINATIONS.HOME,
    );
  });

  it('EXPERT는 온보딩 대상이 아니다 → HOME', async () => {
    const { email } = await createRegisteredUser('onb-expert');
    const userId = await userIdByEmail(email);
    await testPrisma.user.update({ where: { id: userId }, data: { role: 'EXPERT' } });
    expect(await resolvePostLoginDestinationForUser(userId, deps)).toBe(
      POST_LOGIN_DESTINATIONS.HOME,
    );
  });

  it('ADMIN은 HOME', async () => {
    const { email } = await createRegisteredUser('onb-admin');
    const userId = await userIdByEmail(email);
    await testPrisma.user.update({ where: { id: userId }, data: { role: 'ADMIN' } });
    expect(await resolvePostLoginDestinationForUser(userId, deps)).toBe(
      POST_LOGIN_DESTINATIONS.HOME,
    );
  });

  it('SUSPENDED/DELETED는 LOGIN (fail-closed)', async () => {
    const { email } = await createRegisteredUser('onb-suspended');
    const userId = await userIdByEmail(email);
    await testPrisma.user.update({ where: { id: userId }, data: { status: 'SUSPENDED' } });
    expect(await resolvePostLoginDestinationForUser(userId, deps)).toBe(
      POST_LOGIN_DESTINATIONS.LOGIN,
    );
    await testPrisma.user.update({
      where: { id: userId },
      data: { status: 'DELETED', deletedAt: new Date() },
    });
    expect(await resolvePostLoginDestinationForUser(userId, deps)).toBe(
      POST_LOGIN_DESTINATIONS.LOGIN,
    );
  });
});

describe('completeTravelerOnboarding — 저장', () => {
  it('핵심 5종 저장 성공 → User 갱신 + TravelerProfile upsert + 완료 판정', async () => {
    const { email } = await createRegisteredUser('onb-save-ok');
    const userId = await userIdByEmail(email);

    const result = await completeTravelerOnboarding(
      { userId, input: serviceInput({ preferredLanguage: 'en' }) },
      deps,
    );
    expect(result).toEqual({ ok: true });

    const user = await testPrisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { travelerProfile: true },
    });
    expect(user.fullName).toBe('김여행');
    expect(user.country).toBe('KR');
    expect(user.preferredLanguage).toBe('en'); // ko/en locale 유지
    expect(user.travelerProfile?.travelPurposes).toEqual([CAT_FITNESS]);
    expect(user.travelerProfile?.preferredCities).toEqual([CITY_JEJU]);
    expect(user.travelerProfile?.travelStyles).toEqual(['nature']);

    expect(await resolvePostLoginDestinationForUser(userId, deps)).toBe(
      POST_LOGIN_DESTINATIONS.HOME,
    );
  });

  it('비활성/미존재 Category slug는 purposeUnknown으로 거부하고 아무 것도 쓰지 않는다', async () => {
    const { email } = await createRegisteredUser('onb-bad-slug');
    const userId = await userIdByEmail(email);

    const result = await completeTravelerOnboarding(
      { userId, input: serviceInput({ travelPurposes: [`${runId}-nope`] }) },
      deps,
    );
    expect(result).toEqual({
      ok: false,
      reason: 'invalid',
      fieldErrors: { travelPurposes: 'purposeUnknown' },
    });

    const user = await testPrisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { travelerProfile: true },
    });
    expect(user.fullName).toBeNull();
    expect(user.travelerProfile).toBeNull();
  });

  it('미존재 preferredCities slug는 cityUnavailable로 거부한다', async () => {
    const { email } = await createRegisteredUser('onb-bad-city');
    const userId = await userIdByEmail(email);
    const result = await completeTravelerOnboarding(
      { userId, input: serviceInput({ preferredCities: [`${runId}-ghost-city`] }) },
      deps,
    );
    expect(result).toEqual({
      ok: false,
      reason: 'invalid',
      fieldErrors: { preferredCities: 'cityUnavailable' },
    });
  });

  it('User.update 이후 실패 주입 시 전체 rollback (User·Profile 미변경)', async () => {
    const { email } = await createRegisteredUser('onb-rollback');
    const userId = await userIdByEmail(email);

    await expect(
      completeTravelerOnboarding({ userId, input: serviceInput() }, deps, {
        beforeProfileUpsert: () => {
          throw new Error('boom');
        },
      }),
    ).rejects.toThrow('boom');

    const user = await testPrisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { travelerProfile: true },
    });
    expect(user.fullName).toBeNull(); // update 롤백됨
    expect(user.travelerProfile).toBeNull(); // upsert 미실행
  });

  it('동일 사용자 동시 submit은 직렬화되어 단일 프로필 row로 수렴한다', async () => {
    const { email } = await createRegisteredUser('onb-concurrent');
    const userId = await userIdByEmail(email);

    const [a, b] = await Promise.all([
      completeTravelerOnboarding({ userId, input: serviceInput({ groupSize: 1 }) }, deps),
      completeTravelerOnboarding({ userId, input: serviceInput({ groupSize: 3 }) }, deps),
    ]);
    expect(a).toEqual({ ok: true });
    expect(b).toEqual({ ok: true });

    const profiles = await testPrisma.travelerProfile.findMany({ where: { userId } });
    expect(profiles).toHaveLength(1); // 중복 row 없음
    expect([1, 3]).toContain(profiles[0]?.groupSize); // last-write-wins
  });

  it('SUSPENDED 사용자는 not-authorized로 거부하고 쓰지 않는다', async () => {
    const { email } = await createRegisteredUser('onb-save-suspended');
    const userId = await userIdByEmail(email);
    await testPrisma.user.update({ where: { id: userId }, data: { status: 'SUSPENDED' } });

    const result = await completeTravelerOnboarding({ userId, input: serviceInput() }, deps);
    expect(result).toEqual({ ok: false, reason: 'not-authorized' });

    const user = await testPrisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { travelerProfile: true },
    });
    expect(user.fullName).toBeNull();
    expect(user.travelerProfile).toBeNull();
  });

  it('EXPERT 역할은 not-authorized로 거부한다', async () => {
    const { email } = await createRegisteredUser('onb-save-expert');
    const userId = await userIdByEmail(email);
    await testPrisma.user.update({ where: { id: userId }, data: { role: 'EXPERT' } });
    const result = await completeTravelerOnboarding({ userId, input: serviceInput() }, deps);
    expect(result).toEqual({ ok: false, reason: 'not-authorized' });
  });

  it('다른 사용자의 프로필은 건드리지 않는다 (userId는 인자에서만)', async () => {
    const { email: emailA } = await createRegisteredUser('onb-owner-a');
    const { email: emailB } = await createRegisteredUser('onb-owner-b');
    const userIdA = await userIdByEmail(emailA);
    const userIdB = await userIdByEmail(emailB);

    await completeTravelerOnboarding({ userId: userIdA, input: serviceInput() }, deps);

    const userB = await testPrisma.user.findUniqueOrThrow({
      where: { id: userIdB },
      include: { travelerProfile: true },
    });
    expect(userB.fullName).toBeNull();
    expect(userB.travelerProfile).toBeNull();
  });
});
