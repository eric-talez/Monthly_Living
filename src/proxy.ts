import createIntlProxy from 'next-intl/middleware';
import { NextResponse, type NextRequest } from 'next/server';

import { routing } from './i18n/routing';
import {
  DELETION_SECURITY_HEADERS,
  describeDeletionTokenExchange,
  isAccountDeletionPath,
} from './modules/users/deletion-token-cookie';

const intlProxy = createIntlProxy(routing);

export default function proxy(request: NextRequest) {
  // 탈퇴 확인 링크의 token 쿼리를 HttpOnly cookie로 교환하고 쿼리 없는 URL로
  // 303 redirect한다 — token이 주소창·히스토리·Referer에 남지 않는다.
  // 정책은 순수 모듈(describeDeletionTokenExchange)이 기술하고 여기서 조립만 한다.
  // DB에는 접근하지 않으므로 이메일 스캐너의 GET으로 토큰이 소비되지 않는다.
  const exchange = describeDeletionTokenExchange({
    method: request.method,
    pathname: request.nextUrl.pathname,
    searchParams: request.nextUrl.searchParams,
    isProduction: process.env.NODE_ENV === 'production',
  });
  if (exchange) {
    const cleanUrl = request.nextUrl.clone();
    cleanUrl.pathname = exchange.redirectPathname;
    cleanUrl.search = '';
    const response = NextResponse.redirect(cleanUrl, exchange.status);
    if (exchange.cookieToSet) {
      response.cookies.set(exchange.cookieToSet);
    }
    // malformed token — 기존(일반·__Secure-) cookie를 같은 Path에서 만료해
    // 이전 token이 clean confirm 화면에서 재사용되지 않게 한다
    for (const clearSpec of exchange.cookiesToClear) {
      response.cookies.set(clearSpec);
    }
    for (const [name, value] of Object.entries(exchange.headers)) {
      response.headers.set(name, value);
    }
    return response;
  }

  const response = intlProxy(request);
  // 탈퇴 하위 화면은 캐시·리퍼러·검색 색인을 차단한다
  if (isAccountDeletionPath(request.nextUrl.pathname)) {
    for (const [name, value] of Object.entries(DELETION_SECURITY_HEADERS)) {
      response.headers.set(name, value);
    }
  }
  return response;
}

export const config = {
  // api 라우트, Next 내부 경로, 정적 파일은 locale 라우팅에서 제외한다.
  matcher: '/((?!api|_next|_vercel|.*\\..*).*)',
};
