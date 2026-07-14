import { routing, type AppLocale } from '@/i18n/routing';
import { isWellFormedAuthToken } from '@/modules/auth/token-pattern';

/**
 * 탈퇴 확인 토큰의 URL → HttpOnly cookie 교환 정책 (순수 모듈).
 *
 * 이메일 링크(/settings/account/delete/confirm?token=...)의 token이 브라우저
 * 주소창·히스토리·Referer에 남지 않도록, GET 진입 시 proxy(src/proxy.ts)가 이
 * 모듈의 기술(descriptor)대로 토큰을 짧은 수명의 HttpOnly cookie로 옮기고
 * 쿼리 없는 URL로 303 redirect한다. DB에는 접근하지 않는다 — 이메일 스캐너가
 * 링크를 열어도 토큰은 소비되지 않는다. 실제 소비는 confirm POST server action만 한다.
 *
 * cookie 이름은 환경별로 분리한다: production은 `__Secure-` prefix(브라우저가
 * Secure 없는 설정·변조를 거부) + Secure 필수 + Domain 미설정, dev/test는 일반
 * 이름. 모든 소비자(page/action/proxy)는 아래 helper만 사용하고 문자열 이름을
 * 직접 복제하지 않는다.
 *
 * next/server를 import하지 않는 이유: 이 모듈은 서비스(account-deletion.ts)와
 * 로그인 복귀 로직도 공유하며, Node 테스트에서 'next/server'는 로드할 수 없다
 * (tests/integration/helpers/session.ts 주석 참고). NextResponse 조립은 proxy.ts가 한다.
 */

const DEV_DELETION_TOKEN_COOKIE = 'account-deletion-token';
const PROD_DELETION_TOKEN_COOKIE = '__Secure-account-deletion-token';

/** 환경별 정식 cookie 이름 — production은 __Secure- prefix */
export function deletionTokenCookieName(isProduction: boolean): string {
  return isProduction ? PROD_DELETION_TOKEN_COOKIE : DEV_DELETION_TOKEN_COOKIE;
}

/** 토큰 TTL(30분)과 동일 — cookie가 토큰보다 오래 살 이유가 없다 */
export const ACCOUNT_DELETION_COOKIE_MAX_AGE_SECONDS = 30 * 60;

export const ACCOUNT_DELETION_CONFIRM_PATHNAME = '/settings/account/delete/confirm';

/** cookie Path 경계 — 탈퇴 하위 경로(confirm/result)에서만 전송된다 */
export const ACCOUNT_DELETION_COOKIE_BASE_PATH = '/settings/account/delete';

/**
 * 비로그인 상태로 confirm 링크를 연 사용자의 로그인 복귀 whitelist 키.
 * open redirect 방지를 위해 경로가 아니라 이 키만 query로 운반하고,
 * 로그인 성공 시 서버가 ACCOUNT_DELETION_CONFIRM_PATHNAME으로 해석한다.
 */
export const NEXT_DELETE_CONFIRM = 'delete-confirm';

/** 탈퇴 화면·교환 응답 공통 보안 헤더 — 캐시·리퍼러·검색 색인 차단 */
export const DELETION_SECURITY_HEADERS = {
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow',
} as const;

/**
 * localePrefix 'as-needed': 기본 로케일(ko)은 prefix 없음, en은 /en.
 * cookie Path는 URL 문자열 기준으로 일치해야 하므로 로케일별로 달라진다.
 */
export function deletionCookiePath(locale: AppLocale): string {
  const prefix = locale === routing.defaultLocale ? '' : `/${locale}`;
  return `${prefix}${ACCOUNT_DELETION_COOKIE_BASE_PATH}`;
}

/** confirm 경로 매칭 — 일치하면 해당 URL 공간의 locale prefix('' 또는 '/en')를 반환 */
export function matchDeletionConfirmPath(pathname: string): { localePrefix: string } | null {
  if (pathname === ACCOUNT_DELETION_CONFIRM_PATHNAME) {
    return { localePrefix: '' };
  }
  for (const locale of routing.locales) {
    if (pathname === `/${locale}${ACCOUNT_DELETION_CONFIRM_PATHNAME}`) {
      return { localePrefix: `/${locale}` };
    }
  }
  return null;
}

/** 탈퇴 하위 경로 여부 — 응답 보안 헤더(no-store 등) 적용 대상 판정 */
export function isAccountDeletionPath(pathname: string): boolean {
  const candidates = [
    ACCOUNT_DELETION_COOKIE_BASE_PATH,
    ...routing.locales.map((locale) => `/${locale}${ACCOUNT_DELETION_COOKIE_BASE_PATH}`),
  ];
  return candidates.some((base) => pathname === base || pathname.startsWith(`${base}/`));
}

/** cookies()·주입 store 공통 읽기 인터페이스 (RSC page·server action 모두 만족) */
export interface DeletionCookieReadStore {
  get(name: string): { value: string } | undefined;
}

/** 현재 환경의 정식 이름으로만 읽는다 — production에서 일반 cookie를 토큰 소스로 쓰지 않는다 */
export function readDeletionTokenCookie(
  store: DeletionCookieReadStore,
  isProduction: boolean,
): string | null {
  return store.get(deletionTokenCookieName(isProduction))?.value ?? null;
}

/**
 * cookie 만료 지시 — __Secure- 이름은 브라우저가 Secure 속성 없는 Set-Cookie를
 * (만료 포함) 거부하므로 이름별 secure 플래그를 함께 운반한다. Domain 미설정.
 */
export interface DeletionCookieClearSpec {
  name: string;
  value: '';
  path: string;
  maxAge: 0;
  httpOnly: true;
  sameSite: 'lax';
  secure: boolean;
}

/** 일반·__Secure- 이름을 같은 Path에서 모두 만료 — migration/stale cookie 정리 */
export function deletionCookieClearSpecs(path: string): DeletionCookieClearSpec[] {
  return [DEV_DELETION_TOKEN_COOKIE, PROD_DELETION_TOKEN_COOKIE].map((name) => ({
    name,
    value: '',
    path,
    maxAge: 0,
    httpOnly: true,
    sameSite: 'lax',
    secure: name.startsWith('__Secure-'),
  }));
}

/** server action 등에서 두 이름을 한 번에 만료시키는 helper */
export function clearDeletionTokenCookies(
  store: { delete(spec: DeletionCookieClearSpec): unknown },
  path: string,
): void {
  for (const spec of deletionCookieClearSpecs(path)) {
    store.delete(spec);
  }
}

export interface DeletionTokenCookieSpec {
  name: string;
  value: string;
  httpOnly: true;
  sameSite: 'lax';
  secure: boolean;
  maxAge: number;
  path: string;
}

export interface DeletionTokenExchange {
  /** 303 See Other — POST가 아닌 GET으로 재요청하게 한다 */
  status: 303;
  /** redirect 대상 pathname (동일 경로) — 쿼리는 전부 제거한다 */
  redirectPathname: string;
  clearQuery: true;
  /** 형식이 유효한 token일 때만 설정 — malformed면 null */
  cookieToSet: DeletionTokenCookieSpec | null;
  /**
   * malformed token이면 기존(일반·__Secure-) cookie를 현재 locale Path에서 모두
   * 만료한다 — 이전의 유효 cookie가 남아 malformed 링크 뒤에 재사용되지 않게 한다.
   */
  cookiesToClear: DeletionCookieClearSpec[];
  headers: typeof DELETION_SECURITY_HEADERS;
}

/**
 * GET confirm?token=... 요청의 교환 기술을 만든다. 해당 없으면 null.
 * token query가 존재하면 항상 쿼리 없는 URL로 303한다. DB 상태는 어떤 경우에도
 * 변하지 않는다 (이 모듈은 DB를 모른다 — token row·usedAt 무변경).
 */
export function describeDeletionTokenExchange(request: {
  method: string;
  pathname: string;
  searchParams: URLSearchParams;
  isProduction: boolean;
}): DeletionTokenExchange | null {
  if (request.method !== 'GET') {
    return null;
  }
  const match = matchDeletionConfirmPath(request.pathname);
  if (!match) {
    return null;
  }
  const token = request.searchParams.get('token');
  if (token === null) {
    return null;
  }

  const cookiePath = `${match.localePrefix}${ACCOUNT_DELETION_COOKIE_BASE_PATH}`;
  const wellFormed = isWellFormedAuthToken(token);

  return {
    status: 303,
    redirectPathname: request.pathname,
    clearQuery: true,
    cookieToSet: wellFormed
      ? {
          name: deletionTokenCookieName(request.isProduction),
          value: token,
          httpOnly: true,
          sameSite: 'lax',
          secure: request.isProduction,
          maxAge: ACCOUNT_DELETION_COOKIE_MAX_AGE_SECONDS,
          path: cookiePath,
        }
      : null,
    cookiesToClear: wellFormed ? [] : deletionCookieClearSpecs(cookiePath),
    headers: DELETION_SECURITY_HEADERS,
  };
}
