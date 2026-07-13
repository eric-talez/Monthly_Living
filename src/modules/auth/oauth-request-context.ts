import { AsyncLocalStorage } from 'node:async_hooks';

import { routing, type AppLocale } from '@/i18n/routing';

/**
 * OAuth 콜백 요청 단위 컨텍스트 (AsyncLocalStorage).
 *
 * Auth.js adapter 함수(createUser/linkAccount)는 요청 객체를 받지 못하므로,
 * handler 래퍼(src/auth.ts createAuthHandlers)가 요청마다 이 컨텍스트를 열어
 * 두 가지를 전달한다:
 * - locale: 신규 OAuth 가입의 preferredLanguage·동의 기록용. 우리가 OAuth 버튼
 *   서버 액션에서 설정한 same-origin redirectTo가 Auth.js `callback-url` 쿠키로
 *   콜백까지 운반되는 것을 파싱한다 (docs/decisions/oauth-account-linking.md).
 * - provisionalUserId: adapter.createUser가 이번 요청에서 만든 User id.
 *   linkAccount 실패 시 보상 정리가 "이번 시도에서 방금 만든 user"임을
 *   증명하는 provenance로만 사용한다 — 다른 요청의 user는 절대 지우지 않는다.
 */
export interface OAuthRequestContext {
  locale: AppLocale;
  provisionalUserId?: string;
}

const storage = new AsyncLocalStorage<OAuthRequestContext>();

export function runWithOAuthRequestContext<T>(context: OAuthRequestContext, fn: () => T): T {
  return storage.run(context, fn);
}

/** 컨텍스트 밖(비 handler 경로) 호출은 undefined — 소비자는 fail-safe로 동작해야 한다 */
export function getOAuthRequestContext(): OAuthRequestContext | undefined {
  return storage.getStore();
}

/**
 * Auth.js가 로그인 flow 동안 유지하는 callback-url 쿠키 이름.
 * 쿠키 이름을 커스터마이즈하지 않으므로 기본값 두 가지만 존재한다
 * (HTTPS(useSecureCookies)에서는 __Secure- prefix가 붙는다).
 */
const CALLBACK_URL_COOKIE_NAMES = ['__Secure-authjs.callback-url', 'authjs.callback-url'];

function readCookie(header: string, name: string): string | undefined {
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) {
      continue;
    }
    if (part.slice(0, eq).trim() === name) {
      return part.slice(eq + 1).trim();
    }
  }
  return undefined;
}

/**
 * callback-url 쿠키의 pathname prefix에서 flow를 시작한 locale을 복원한다.
 *
 * 쿠키 값은 Auth.js 기본 redirect callback이 same-origin으로 검증한 URL이며,
 * 값 자체는 OAuth 버튼 서버 액션이 현재 locale로 만든 redirectTo다 — 즉
 * UI에서 시작한 flow는 항상 결정적으로 locale이 복원된다. 쿠키가 없거나
 * 해석 불가한 경우(UI를 거치지 않은 직접 API 호출)만 기본 locale로
 * fallback한다 (결정 문서에 기록된 한계).
 */
export function localeFromRequestCookies(request: Request): AppLocale {
  const header = request.headers.get('cookie');
  if (!header) {
    return routing.defaultLocale;
  }

  for (const cookieName of CALLBACK_URL_COOKIE_NAMES) {
    const raw = readCookie(header, cookieName);
    if (!raw) {
      continue;
    }

    let pathname: string;
    try {
      pathname = new URL(decodeURIComponent(raw), 'http://localhost').pathname;
    } catch {
      continue;
    }

    const firstSegment = pathname.split('/')[1];
    const matched = routing.locales.find((locale) => locale === firstSegment);
    if (matched) {
      return matched;
    }
    // 유효한 쿠키가 있고 locale prefix가 없으면 기본 locale 경로에서 시작한 flow다
    return routing.defaultLocale;
  }

  return routing.defaultLocale;
}
