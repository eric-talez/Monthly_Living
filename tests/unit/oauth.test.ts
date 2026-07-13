import { describe, expect, it } from 'vitest';

import {
  isOAuthProviderId,
  mapGoogleProfile,
  mapKakaoProfile,
  normalizeKakaoId,
  validateOAuthProfile,
} from '@/modules/auth/oauth';

/**
 * OAuth 프로필 검증 매트릭스 — 순수 모듈(DB·env 불필요).
 * DB를 사용하는 identity 판정(ensureOAuthIdentity)·실제 handler 왕복은
 * tests/integration/oauth.test.ts가 검증한다.
 */

const GOOGLE_OK = {
  sub: 'google-sub-1',
  email: 'User@Example.com',
  email_verified: true as const,
  name: 'G User',
  picture: 'https://example.com/p.png',
};

const KAKAO_OK = {
  id: 12345,
  kakao_account: {
    email: 'Kakao@Example.com',
    is_email_valid: true,
    is_email_verified: true,
    profile: { nickname: '닉네임' },
  },
};

function googleInput(profile: unknown, providerAccountId: unknown = 'google-sub-1') {
  return { providerId: 'google', profile, providerAccountId };
}

function kakaoInput(profile: unknown, providerAccountId: unknown = '12345') {
  return { providerId: 'kakao', profile, providerAccountId };
}

describe('validateOAuthProfile — 허용 경로', () => {
  it('Google: 검증된 이메일 + sub 일치 → 정규화된 identity 반환', () => {
    const result = validateOAuthProfile(googleInput(GOOGLE_OK));
    expect(result).toEqual({
      ok: true,
      providerId: 'google',
      providerAccountId: 'google-sub-1',
      email: 'user@example.com', // 정규화(lowercase)
      name: 'G User',
      image: 'https://example.com/p.png',
    });
  });

  it('Kakao: 숫자 id는 문자열화되어 providerAccountId와 비교된다', () => {
    const result = validateOAuthProfile(kakaoInput(KAKAO_OK));
    expect(result).toMatchObject({
      ok: true,
      providerId: 'kakao',
      providerAccountId: '12345',
      email: 'kakao@example.com',
      name: '닉네임',
    });
  });
});

describe('validateOAuthProfile — 거부 매트릭스', () => {
  it.each([
    ['sub 누락', { ...GOOGLE_OK, sub: undefined }],
    ['email 누락', { ...GOOGLE_OK, email: undefined }],
    ['email_verified false', { ...GOOGLE_OK, email_verified: false }],
    ['email_verified 문자열 "true"', { ...GOOGLE_OK, email_verified: 'true' }],
    ['email_verified 숫자 1', { ...GOOGLE_OK, email_verified: 1 }],
    ['프로필이 객체가 아님', 'not-an-object'],
  ])('Google 거부: %s', (_label, profile) => {
    expect(validateOAuthProfile(googleInput(profile))).toEqual({
      ok: false,
      reason: 'profile-rejected',
    });
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
  ])('Kakao 거부: %s', (_label, profile) => {
    expect(validateOAuthProfile(kakaoInput(profile))).toEqual({
      ok: false,
      reason: 'profile-rejected',
    });
  });

  it.each([
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['소수', 123.5],
    ['음수', -1],
    ['MAX_SAFE_INTEGER 초과', Number.MAX_SAFE_INTEGER + 1],
    ['빈 문자열', ''],
    ['공백만', '   '],
    ['비숫자 문자열', '12a45'],
    ['21자리 초과', '1'.repeat(21)],
    ['불리언', true],
  ])('Kakao unsafe id 거부: %s', (_label, id) => {
    // providerAccountId는 유효한 형태로 고정 — 프로필 id 자체의 거부를 검증한다
    const profile = { ...KAKAO_OK, id };
    expect(validateOAuthProfile(kakaoInput(profile, '12345'))).toEqual({
      ok: false,
      reason: 'profile-rejected',
    });
  });

  it('providerAccountId가 프로필 식별자와 다르면 거부한다 (google/kakao)', () => {
    expect(validateOAuthProfile(googleInput(GOOGLE_OK, 'other-sub'))).toEqual({
      ok: false,
      reason: 'provider-account-id-mismatch',
    });
    expect(validateOAuthProfile(kakaoInput(KAKAO_OK, '99999'))).toEqual({
      ok: false,
      reason: 'provider-account-id-mismatch',
    });
  });

  it('providerAccountId가 문자열이 아니거나 비어 있으면 거부한다', () => {
    expect(validateOAuthProfile(googleInput(GOOGLE_OK, 12345))).toEqual({
      ok: false,
      reason: 'provider-account-id-invalid',
    });
    expect(validateOAuthProfile(googleInput(GOOGLE_OK, ''))).toEqual({
      ok: false,
      reason: 'provider-account-id-invalid',
    });
  });

  it('지원하지 않는 provider는 거부한다', () => {
    expect(
      validateOAuthProfile({ providerId: 'github', profile: GOOGLE_OK, providerAccountId: 'x' }),
    ).toEqual({ ok: false, reason: 'unsupported-provider' });
  });

  it('비정상 형식·길이 초과 이메일은 emailSchema에서 거부된다', () => {
    expect(validateOAuthProfile(googleInput({ ...GOOGLE_OK, email: 'not-an-email' }))).toEqual({
      ok: false,
      reason: 'email-invalid',
    });
    const tooLong = `${'a'.repeat(250)}@example.com`;
    expect(validateOAuthProfile(googleInput({ ...GOOGLE_OK, email: tooLong }))).toEqual({
      ok: false,
      reason: 'email-invalid',
    });
  });
});

describe('normalizeKakaoId', () => {
  it('안전 정수·숫자 문자열만 정규화한다', () => {
    expect(normalizeKakaoId(9_900_000_001)).toBe('9900000001');
    expect(normalizeKakaoId(0)).toBe('0');
    expect(normalizeKakaoId(' 12345 ')).toBe('12345');
    expect(normalizeKakaoId(Number.MAX_SAFE_INTEGER)).toBe(String(Number.MAX_SAFE_INTEGER));
  });

  it.each([
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['-Infinity', Number.NEGATIVE_INFINITY],
    ['소수', 1.5],
    ['음수', -10],
    ['MAX_SAFE_INTEGER+1', Number.MAX_SAFE_INTEGER + 1],
    ['빈 문자열', ''],
    ['공백', '  '],
    ['비숫자', 'abc'],
    ['혼합', '123x'],
    ['null', null],
    ['undefined', undefined],
    ['객체', {}],
  ])('거부: %s', (_label, value) => {
    expect(normalizeKakaoId(value)).toBeUndefined();
  });
});

describe('profile 매핑 (Prisma User 컬럼만, throw 금지)', () => {
  it('Google: 매핑·이메일 정규화, sub 누락 시 id는 undefined 유지', () => {
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

  it('Kakao: 정규화 id만 인정, 중첩 프로필 매핑, 누락·unsafe 안전', () => {
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
    expect(mapKakaoProfile({ id: 1.5 }).id).toBeUndefined();
    expect(mapKakaoProfile({ id: Number.MAX_SAFE_INTEGER + 1 }).id).toBeUndefined();
  });

  it('isOAuthProviderId는 google/kakao만 인정한다', () => {
    expect(isOAuthProviderId('google')).toBe(true);
    expect(isOAuthProviderId('kakao')).toBe(true);
    expect(isOAuthProviderId('github')).toBe(false);
    expect(isOAuthProviderId(undefined)).toBe(false);
  });
});
