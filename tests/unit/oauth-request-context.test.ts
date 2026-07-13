import { describe, expect, it } from 'vitest';

import {
  getOAuthRequestContext,
  localeFromRequestCookies,
  runWithOAuthRequestContext,
} from '@/modules/auth/oauth-request-context';

function requestWithCookie(cookieHeader?: string): Request {
  return new Request('http://localhost:3000/api/auth/callback/google', {
    headers: cookieHeader === undefined ? {} : { cookie: cookieHeader },
  });
}

const encoded = (value: string) => encodeURIComponent(value);

describe('localeFromRequestCookies — callback-url 쿠키에서 locale 복원', () => {
  it('절대 URL의 /en prefix → en', () => {
    const request = requestWithCookie(`authjs.callback-url=${encoded('http://localhost:3000/en')}`);
    expect(localeFromRequestCookies(request)).toBe('en');
  });

  it('locale prefix 없는 경로(기본 한국어 flow) → ko', () => {
    const request = requestWithCookie(`authjs.callback-url=${encoded('http://localhost:3000/')}`);
    expect(localeFromRequestCookies(request)).toBe('ko');
  });

  it('__Secure- prefix 쿠키 이름(HTTPS)도 인식한다', () => {
    const request = requestWithCookie(
      `__Secure-authjs.callback-url=${encoded('https://example.com/en/login')}`,
    );
    expect(localeFromRequestCookies(request)).toBe('en');
  });

  it('다른 쿠키가 섞여 있어도 정확한 이름만 매칭한다', () => {
    const request = requestWithCookie(
      `authjs.csrf-token=abc; authjs.callback-url=${encoded('http://localhost:3000/en')}; other=1`,
    );
    expect(localeFromRequestCookies(request)).toBe('en');
  });

  it('locale이 아닌 첫 세그먼트(/enx)는 기본 locale로 처리한다', () => {
    const request = requestWithCookie(
      `authjs.callback-url=${encoded('http://localhost:3000/enx/page')}`,
    );
    expect(localeFromRequestCookies(request)).toBe('ko');
  });

  it('쿠키가 없거나 값이 URL로 해석 불가하면 기본 locale', () => {
    expect(localeFromRequestCookies(requestWithCookie())).toBe('ko');
    expect(localeFromRequestCookies(requestWithCookie('authjs.callback-url=%'))).toBe('ko');
  });

  it('상대 경로 값(/en)도 처리한다', () => {
    const request = requestWithCookie(`authjs.callback-url=${encoded('/en')}`);
    expect(localeFromRequestCookies(request)).toBe('en');
  });
});

describe('OAuth 요청 컨텍스트 (AsyncLocalStorage)', () => {
  it('run 안에서만 컨텍스트가 보이고, await을 건너도 유지된다', async () => {
    expect(getOAuthRequestContext()).toBeUndefined();

    await runWithOAuthRequestContext({ locale: 'en' }, async () => {
      expect(getOAuthRequestContext()?.locale).toBe('en');
      await Promise.resolve();
      getOAuthRequestContext()!.provisionalUserId = 'user-1';
      await Promise.resolve();
      expect(getOAuthRequestContext()?.provisionalUserId).toBe('user-1');
    });

    expect(getOAuthRequestContext()).toBeUndefined();
  });

  it('동시 실행되는 컨텍스트는 서로 격리된다', async () => {
    const seen: Array<string | undefined> = [];
    await Promise.all([
      runWithOAuthRequestContext({ locale: 'ko' }, async () => {
        await Promise.resolve();
        getOAuthRequestContext()!.provisionalUserId = 'a';
        await Promise.resolve();
        seen.push(getOAuthRequestContext()?.provisionalUserId);
      }),
      runWithOAuthRequestContext({ locale: 'en' }, async () => {
        getOAuthRequestContext()!.provisionalUserId = 'b';
        await Promise.resolve();
        seen.push(getOAuthRequestContext()?.provisionalUserId);
      }),
    ]);
    expect(seen.sort()).toEqual(['a', 'b']);
  });
});
