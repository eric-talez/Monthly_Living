import { describe, expect, it } from 'vitest';

import { generateRawToken } from '@/modules/auth/tokens';
import {
  ACCOUNT_DELETION_COOKIE_MAX_AGE_SECONDS,
  ACCOUNT_DELETION_CONFIRM_PATHNAME,
  clearDeletionTokenCookies,
  DELETION_SECURITY_HEADERS,
  deletionCookieClearSpecs,
  deletionCookiePath,
  deletionTokenCookieName,
  describeDeletionTokenExchange,
  isAccountDeletionPath,
  matchDeletionConfirmPath,
  readDeletionTokenCookie,
  type DeletionCookieClearSpec,
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

/** name → value 맵 기반 fake store — clear spec 적용까지 시뮬레이션한다 */
function fakeJar(initial: Record<string, string> = {}) {
  const jar = new Map(Object.entries(initial));
  const cleared: DeletionCookieClearSpec[] = [];
  return {
    jar,
    cleared,
    store: {
      get: (name: string) => {
        const value = jar.get(name);
        return value === undefined ? undefined : { value };
      },
      delete: (spec: DeletionCookieClearSpec) => {
        cleared.push(spec);
        jar.delete(spec.name);
      },
    },
  };
}

describe('환경별 cookie 이름', () => {
  it('development/test는 일반 이름, production은 __Secure- prefix', () => {
    expect(deletionTokenCookieName(false)).toBe('account-deletion-token');
    expect(deletionTokenCookieName(true)).toBe('__Secure-account-deletion-token');
  });

  it('development read는 일반 cookie를 사용하고 __Secure- cookie는 무시한다', () => {
    const { store } = fakeJar({
      'account-deletion-token': 'dev-value',
      '__Secure-account-deletion-token': 'prod-value',
    });
    expect(readDeletionTokenCookie(store, false)).toBe('dev-value');
  });

  it('production read는 __Secure- cookie를 사용하고 일반 cookie는 토큰 소스로 쓰지 않는다', () => {
    const both = fakeJar({
      'account-deletion-token': 'dev-value',
      '__Secure-account-deletion-token': 'prod-value',
    });
    expect(readDeletionTokenCookie(both.store, true)).toBe('prod-value');

    const onlyPlain = fakeJar({ 'account-deletion-token': 'dev-value' });
    expect(readDeletionTokenCookie(onlyPlain.store, true)).toBeNull();
  });

  it('clear는 일반·__Secure- 이름을 같은 Path에서 모두 Max-Age=0으로 만료한다', () => {
    const specs = deletionCookieClearSpecs('/settings/account/delete');
    expect(specs.map((spec) => spec.name)).toEqual([
      'account-deletion-token',
      '__Secure-account-deletion-token',
    ]);
    for (const spec of specs) {
      expect(spec.maxAge).toBe(0);
      expect(spec.value).toBe('');
      expect(spec.path).toBe('/settings/account/delete');
      expect(spec.httpOnly).toBe(true);
      expect(spec.sameSite).toBe('lax');
      // __Secure- 이름은 Secure 속성 없이는 브라우저가 만료 Set-Cookie도 거부한다
      expect(spec.secure).toBe(spec.name.startsWith('__Secure-'));
    }

    const { store, jar, cleared } = fakeJar({
      'account-deletion-token': 'stale-dev',
      '__Secure-account-deletion-token': 'stale-prod',
    });
    clearDeletionTokenCookies(store, '/settings/account/delete');
    expect(cleared).toHaveLength(2);
    expect(jar.size).toBe(0);
  });
});

describe('describeDeletionTokenExchange', () => {
  it('정상 token(dev): 303 + 쿼리 제거 + 일반 이름 HttpOnly/SameSite=Lax/secure=false cookie', () => {
    const token = generateRawToken();
    const exchange = describeDeletionTokenExchange(exchangeRequest({ token }));

    expect(exchange).not.toBeNull();
    expect(exchange?.status).toBe(303);
    // 주소창에서 token 쿼리가 제거된다 — 같은 pathname으로만 이동
    expect(exchange?.redirectPathname).toBe(ACCOUNT_DELETION_CONFIRM_PATHNAME);
    expect(exchange?.clearQuery).toBe(true);
    expect(exchange?.cookiesToClear).toEqual([]);
    expect(exchange?.cookieToSet).toMatchObject({
      name: 'account-deletion-token',
      value: token,
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      path: '/settings/account/delete',
    });
    expect(exchange?.cookieToSet?.maxAge).toBe(ACCOUNT_DELETION_COOKIE_MAX_AGE_SECONDS);
    expect(ACCOUNT_DELETION_COOKIE_MAX_AGE_SECONDS).toBeLessThanOrEqual(30 * 60);
  });

  it('정상 token(production): __Secure- 이름 + secure=true cookie', () => {
    const exchange = describeDeletionTokenExchange(
      exchangeRequest({ token: generateRawToken(), isProduction: true }),
    );
    expect(exchange?.cookieToSet).toMatchObject({
      name: '__Secure-account-deletion-token',
      secure: true,
    });
  });

  it('en prefix 경로는 cookie Path에도 /en prefix가 반영된다', () => {
    const exchange = describeDeletionTokenExchange(
      exchangeRequest({
        token: generateRawToken(),
        pathname: `/en${ACCOUNT_DELETION_CONFIRM_PATHNAME}`,
      }),
    );
    expect(exchange?.cookieToSet?.path).toBe('/en/settings/account/delete');
    expect(exchange?.redirectPathname).toBe(`/en${ACCOUNT_DELETION_CONFIRM_PATHNAME}`);
  });

  it('malformed token: cookie 미설정 + 두 이름 모두 현재 locale Path에서 만료 + 303', () => {
    const exchange = describeDeletionTokenExchange(exchangeRequest({ token: 'not-a-token' }));
    expect(exchange).not.toBeNull();
    expect(exchange?.status).toBe(303);
    expect(exchange?.redirectPathname).toBe(ACCOUNT_DELETION_CONFIRM_PATHNAME);
    expect(exchange?.cookieToSet).toBeNull();
    expect(exchange?.cookiesToClear.map((spec) => spec.name)).toEqual([
      'account-deletion-token',
      '__Secure-account-deletion-token',
    ]);
    expect(
      exchange?.cookiesToClear.every(
        (spec) => spec.maxAge === 0 && spec.path === '/settings/account/delete',
      ),
    ).toBe(true);
  });

  it('malformed token(en): 만료 Path에도 /en prefix가 반영된다', () => {
    const exchange = describeDeletionTokenExchange(
      exchangeRequest({ token: 'bad', pathname: `/en${ACCOUNT_DELETION_CONFIRM_PATHNAME}` }),
    );
    expect(
      exchange?.cookiesToClear.every((spec) => spec.path === '/en/settings/account/delete'),
    ).toBe(true);
  });

  it('기존 유효 cookie가 있어도 malformed 링크 뒤에는 이전 token이 남지 않는다', () => {
    const staleToken = generateRawToken();
    const { store, jar } = fakeJar({ 'account-deletion-token': staleToken });

    const exchange = describeDeletionTokenExchange(exchangeRequest({ token: 'bad-token' }));
    expect(exchange?.cookieToSet).toBeNull();
    // proxy가 clear 명령을 그대로 적용하면(무시 금지) clean confirm 화면은 missing 상태다
    for (const spec of exchange?.cookiesToClear ?? []) {
      store.delete(spec);
    }
    expect(jar.size).toBe(0);
    expect(readDeletionTokenCookie(store, false)).toBeNull();
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
