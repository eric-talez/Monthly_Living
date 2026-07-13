import { describe, expect, it } from 'vitest';

import { generateRawToken } from '@/modules/auth/tokens';
import {
  ACCOUNT_DELETION_COOKIE_MAX_AGE_SECONDS,
  ACCOUNT_DELETION_CONFIRM_PATHNAME,
  ACCOUNT_DELETION_TOKEN_COOKIE,
  DELETION_SECURITY_HEADERS,
  deletionCookiePath,
  describeDeletionTokenExchange,
  isAccountDeletionPath,
  matchDeletionConfirmPath,
} from '@/modules/users/deletion-token-cookie';

function exchangeRequest(overrides: {
  method?: string;
  pathname?: string;
  token?: string | null;
  isProduction?: boolean;
}) {
  const searchParams = new URLSearchParams();
  if (overrides.token !== null && overrides.token !== undefined) {
    searchParams.set('token', overrides.token);
  }
  return {
    method: overrides.method ?? 'GET',
    pathname: overrides.pathname ?? ACCOUNT_DELETION_CONFIRM_PATHNAME,
    searchParams,
    isProduction: overrides.isProduction ?? false,
  };
}

describe('describeDeletionTokenExchange', () => {
  it('정상 token: 303 + 쿼리 제거 + HttpOnly/SameSite=Lax/Max-Age≤30분 cookie', () => {
    const token = generateRawToken();
    const exchange = describeDeletionTokenExchange(exchangeRequest({ token }));

    expect(exchange).not.toBeNull();
    expect(exchange?.status).toBe(303);
    // 주소창에서 token 쿼리가 제거된다 — 같은 pathname으로만 이동
    expect(exchange?.redirectPathname).toBe(ACCOUNT_DELETION_CONFIRM_PATHNAME);
    expect(exchange?.clearQuery).toBe(true);
    expect(exchange?.cookie).toMatchObject({
      name: ACCOUNT_DELETION_TOKEN_COOKIE,
      value: token,
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      path: '/settings/account/delete',
    });
    expect(exchange?.cookie?.maxAge).toBe(ACCOUNT_DELETION_COOKIE_MAX_AGE_SECONDS);
    expect(ACCOUNT_DELETION_COOKIE_MAX_AGE_SECONDS).toBeLessThanOrEqual(30 * 60);
  });

  it('production에서는 Secure cookie를 설정한다', () => {
    const exchange = describeDeletionTokenExchange(
      exchangeRequest({ token: generateRawToken(), isProduction: true }),
    );
    expect(exchange?.cookie?.secure).toBe(true);
  });

  it('en prefix 경로는 cookie Path에도 /en prefix가 반영된다', () => {
    const exchange = describeDeletionTokenExchange(
      exchangeRequest({
        token: generateRawToken(),
        pathname: `/en${ACCOUNT_DELETION_CONFIRM_PATHNAME}`,
      }),
    );
    expect(exchange?.cookie?.path).toBe('/en/settings/account/delete');
    expect(exchange?.redirectPathname).toBe(`/en${ACCOUNT_DELETION_CONFIRM_PATHNAME}`);
  });

  it('형식이 유효하지 않은 token은 cookie 없이 쿼리만 제거한다', () => {
    const exchange = describeDeletionTokenExchange(exchangeRequest({ token: 'not-a-token' }));
    expect(exchange).not.toBeNull();
    expect(exchange?.status).toBe(303);
    expect(exchange?.cookie).toBeNull();
  });

  it('token 쿼리가 없는 GET에는 개입하지 않는다 (clean URL은 페이지가 렌더)', () => {
    expect(describeDeletionTokenExchange(exchangeRequest({ token: null }))).toBeNull();
  });

  it('GET이 아닌 요청에는 개입하지 않는다', () => {
    expect(
      describeDeletionTokenExchange(exchangeRequest({ method: 'POST', token: generateRawToken() })),
    ).toBeNull();
  });

  it('confirm 이외 경로에는 개입하지 않는다', () => {
    expect(
      describeDeletionTokenExchange(
        exchangeRequest({ pathname: '/settings/account', token: generateRawToken() }),
      ),
    ).toBeNull();
  });

  it('교환 응답은 no-store/no-referrer/noindex 헤더를 포함한다', () => {
    const exchange = describeDeletionTokenExchange(exchangeRequest({ token: generateRawToken() }));
    expect(exchange?.headers).toEqual({
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Robots-Tag': 'noindex, nofollow',
    });
    expect(exchange?.headers).toBe(DELETION_SECURITY_HEADERS);
  });
});

describe('경로 헬퍼', () => {
  it('matchDeletionConfirmPath — 기본 로케일은 prefix 없음, en은 /en prefix', () => {
    expect(matchDeletionConfirmPath(ACCOUNT_DELETION_CONFIRM_PATHNAME)).toEqual({
      localePrefix: '',
    });
    expect(matchDeletionConfirmPath(`/en${ACCOUNT_DELETION_CONFIRM_PATHNAME}`)).toEqual({
      localePrefix: '/en',
    });
    expect(matchDeletionConfirmPath('/settings/account')).toBeNull();
  });

  it('deletionCookiePath — 로케일별 cookie Path', () => {
    expect(deletionCookiePath('ko')).toBe('/settings/account/delete');
    expect(deletionCookiePath('en')).toBe('/en/settings/account/delete');
  });

  it('isAccountDeletionPath — 탈퇴 하위 경로만 참', () => {
    expect(isAccountDeletionPath('/settings/account/delete')).toBe(true);
    expect(isAccountDeletionPath('/settings/account/delete/confirm')).toBe(true);
    expect(isAccountDeletionPath('/en/settings/account/delete/result')).toBe(true);
    expect(isAccountDeletionPath('/settings/account')).toBe(false);
    expect(isAccountDeletionPath('/')).toBe(false);
  });
});
