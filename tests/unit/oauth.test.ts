import { describe, expect, it, vi } from 'vitest';

import type { AuthServiceDeps } from '@/modules/auth/deps';
import {
  evaluateOAuthSignIn,
  isOAuthProviderId,
  mapGoogleProfile,
  mapKakaoProfile,
} from '@/modules/auth/oauth';

/**
 * OAuth 정책 결정 매트릭스 — 순수 모듈이므로 fake db만 주입해 검증한다.
 * 실제 handler·DB 경유 검증은 tests/integration/oauth.test.ts.
 */

interface FakeRows {
  account?: { user: { status: string; deletedAt: Date | null } } | null;
  user?: { status: string; deletedAt: Date | null } | null;
}

function fakeDeps(rows: FakeRows = {}) {
  const accountFindUnique = vi.fn(async () => rows.account ?? null);
  const userFindUnique = vi.fn(async () => rows.user ?? null);
  const deps = {
    db: {
      account: { findUnique: accountFindUnique },
      user: { findUnique: userFindUnique },
    } as unknown as AuthServiceDeps['db'],
  } satisfies Pick<AuthServiceDeps, 'db'>;
  return { deps, accountFindUnique, userFindUnique };
}

const GOOGLE_OK = {
  sub: 'google-sub-1',
  email: 'User@Example.com',
  email_verified: true as const,
};

const KAKAO_OK = {
  id: 12345,
  kakao_account: { email: 'kakao@example.com', is_email_valid: true, is_email_verified: true },
};

function googleInput(profile: unknown, providerAccountId: unknown = 'google-sub-1') {
  return { providerId: 'google', profile, providerAccountId };
}

function kakaoInput(profile: unknown, providerAccountId: unknown = '12345') {
  return { providerId: 'kakao', profile, providerAccountId };
}

describe('evaluateOAuthSignIn — 프로필·식별자 검증', () => {
  it('Google: 검증된 이메일 + sub 일치는 신규 가입 허용', async () => {
    const { deps, userFindUnique } = fakeDeps();
    const decision = await evaluateOAuthSignIn(googleInput(GOOGLE_OK), deps);
    expect(decision).toEqual({ allowed: true, kind: 'no-account' });
    // 이메일은 정규화된 값으로 조회한다
    expect(userFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: 'user@example.com' } }),
    );
  });

  it('Kakao: 숫자 id는 문자열화되어 providerAccountId와 비교된다', async () => {
    const { deps } = fakeDeps();
    const decision = await evaluateOAuthSignIn(kakaoInput(KAKAO_OK), deps);
    expect(decision).toEqual({ allowed: true, kind: 'no-account' });
  });

  it.each([
    ['sub 누락', { ...GOOGLE_OK, sub: undefined }],
    ['email 누락', { ...GOOGLE_OK, email: undefined }],
    ['email_verified false', { ...GOOGLE_OK, email_verified: false }],
    ['email_verified 문자열 "true"', { ...GOOGLE_OK, email_verified: 'true' }],
    ['email_verified 숫자 1', { ...GOOGLE_OK, email_verified: 1 }],
    ['프로필이 객체가 아님', 'not-an-object'],
  ])('Google 거부: %s', async (_label, profile) => {
    const { deps, accountFindUnique } = fakeDeps();
    const decision = await evaluateOAuthSignIn(googleInput(profile), deps);
    expect(decision).toEqual({ allowed: false, reason: 'profile-rejected' });
    expect(accountFindUnique).not.toHaveBeenCalled(); // DB 도달 전에 거부
  });

  it.each([
    ['id 누락', { ...KAKAO_OK, id: undefined }],
    ['kakao_account 누락', { id: 12345 }],
    ['email 누락', { id: 12345, kakao_account: { is_email_valid: true, is_email_verified: true } }],
    [
      'is_email_valid false',
      { id: 12345, kakao_account: { ...KAKAO_OK.kakao_account, is_email_valid: false } },
    ],
    [
      'is_email_verified false',
      { id: 12345, kakao_account: { ...KAKAO_OK.kakao_account, is_email_verified: false } },
    ],
    [
      'is_email_verified 숫자 1',
      { id: 12345, kakao_account: { ...KAKAO_OK.kakao_account, is_email_verified: 1 } },
    ],
  ])('Kakao 거부: %s', async (_label, profile) => {
    const { deps } = fakeDeps();
    const decision = await evaluateOAuthSignIn(kakaoInput(profile), deps);
    expect(decision).toEqual({ allowed: false, reason: 'profile-rejected' });
  });

  it('providerAccountId가 프로필 식별자와 다르면 거부한다 (google/kakao)', async () => {
    const { deps } = fakeDeps();
    expect(await evaluateOAuthSignIn(googleInput(GOOGLE_OK, 'other-sub'), deps)).toEqual({
      allowed: false,
      reason: 'provider-account-id-mismatch',
    });
    expect(await evaluateOAuthSignIn(kakaoInput(KAKAO_OK, '99999'), deps)).toEqual({
      allowed: false,
      reason: 'provider-account-id-mismatch',
    });
  });

  it('providerAccountId가 문자열이 아니거나 비어 있으면 거부한다', async () => {
    const { deps } = fakeDeps();
    expect(await evaluateOAuthSignIn(googleInput(GOOGLE_OK, 12345), deps)).toEqual({
      allowed: false,
      reason: 'provider-account-id-invalid',
    });
    expect(await evaluateOAuthSignIn(googleInput(GOOGLE_OK, ''), deps)).toEqual({
      allowed: false,
      reason: 'provider-account-id-invalid',
    });
  });

  it('지원하지 않는 provider는 거부한다', async () => {
    const { deps } = fakeDeps();
    const decision = await evaluateOAuthSignIn(
      { providerId: 'github', profile: GOOGLE_OK, providerAccountId: 'x' },
      deps,
    );
    expect(decision).toEqual({ allowed: false, reason: 'unsupported-provider' });
  });

  it('비정상 형식·길이 초과 이메일은 emailSchema에서 거부된다', async () => {
    const { deps } = fakeDeps();
    expect(
      await evaluateOAuthSignIn(googleInput({ ...GOOGLE_OK, email: 'not-an-email' }), deps),
    ).toEqual({ allowed: false, reason: 'email-invalid' });

    const tooLong = `${'a'.repeat(250)}@example.com`;
    expect(await evaluateOAuthSignIn(googleInput({ ...GOOGLE_OK, email: tooLong }), deps)).toEqual({
      allowed: false,
      reason: 'email-invalid',
    });
  });
});

describe('evaluateOAuthSignIn — 계정 상태', () => {
  const activeOwner = { user: { status: 'ACTIVE', deletedAt: null } };

  it('Account가 이미 있으면(재로그인) 소유자가 ACTIVE일 때만 허용한다', async () => {
    const { deps, accountFindUnique } = fakeDeps({ account: activeOwner });
    const decision = await evaluateOAuthSignIn(googleInput(GOOGLE_OK), deps);
    expect(decision).toEqual({ allowed: true, kind: 'existing-account' });
    expect(accountFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          provider_providerAccountId: {
            provider: 'google',
            providerAccountId: 'google-sub-1',
          },
        },
      }),
    );
  });

  it.each([
    ['SUSPENDED', { status: 'SUSPENDED', deletedAt: null }],
    ['DELETED', { status: 'DELETED', deletedAt: null }],
    ['deletedAt 설정', { status: 'ACTIVE', deletedAt: new Date() }],
  ])('Account 소유자가 %s이면 재로그인을 거부한다', async (_label, owner) => {
    const { deps } = fakeDeps({ account: { user: owner } });
    const decision = await evaluateOAuthSignIn(googleInput(GOOGLE_OK), deps);
    expect(decision).toEqual({ allowed: false, reason: 'account-owner-not-active' });
  });

  it.each([
    ['SUSPENDED', { status: 'SUSPENDED', deletedAt: null }],
    ['DELETED', { status: 'DELETED', deletedAt: null }],
    ['deletedAt 설정', { status: 'ACTIVE', deletedAt: new Date() }],
  ])('동일 이메일 기존 user가 %s이면 신규 연결 시도도 거부한다', async (_label, user) => {
    const { deps } = fakeDeps({ user });
    const decision = await evaluateOAuthSignIn(googleInput(GOOGLE_OK), deps);
    expect(decision).toEqual({ allowed: false, reason: 'existing-user-not-active' });
  });

  it('동일 이메일 ACTIVE user가 있어도 허용은 하되 자동 연결은 core가 차단한다 (fail-safe 위임)', async () => {
    const { deps } = fakeDeps({ user: { status: 'ACTIVE', deletedAt: null } });
    const decision = await evaluateOAuthSignIn(googleInput(GOOGLE_OK), deps);
    expect(decision).toEqual({ allowed: true, kind: 'no-account' });
  });
});

describe('profile 매핑 (Prisma User 컬럼만, throw 금지)', () => {
  it('Google: 매핑·이메일 정규화, sub 누락 시 id는 undefined 유지', async () => {
    expect(
      mapGoogleProfile({
        sub: 's1',
        name: 'Name',
        email: ' User@EXAMPLE.com ',
        picture: 'https://example.com/p.png',
      }),
    ).toEqual({
      id: 's1',
      name: 'Name',
      email: 'user@example.com',
      image: 'https://example.com/p.png',
    });

    // 누락 시 강제 문자열화 금지 — "undefined" 같은 가짜 안정 id가 생기면 안 된다
    expect(mapGoogleProfile({ email: 'a@b.com' }).id).toBeUndefined();
    expect(mapGoogleProfile({ sub: 123 as unknown as string }).id).toBeUndefined();
  });

  it('Kakao: 숫자 id 문자열화, 중첩 프로필 매핑, 누락 안전', async () => {
    expect(
      mapKakaoProfile({
        id: 999,
        kakao_account: {
          email: 'K@Example.com',
          profile: { nickname: '닉네임', profile_image_url: 'https://example.com/k.png' },
        },
      }),
    ).toEqual({
      id: '999',
      name: '닉네임',
      email: 'k@example.com',
      image: 'https://example.com/k.png',
    });

    expect(mapKakaoProfile({})).toEqual({
      id: undefined,
      name: undefined,
      email: undefined,
      image: undefined,
    });
    expect(mapKakaoProfile({ id: Number.NaN }).id).toBeUndefined();
  });

  it('isOAuthProviderId는 google/kakao만 인정한다', () => {
    expect(isOAuthProviderId('google')).toBe(true);
    expect(isOAuthProviderId('kakao')).toBe(true);
    expect(isOAuthProviderId('github')).toBe(false);
    expect(isOAuthProviderId(undefined)).toBe(false);
  });
});
