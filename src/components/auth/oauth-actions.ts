'use server';

import { hasLocale } from 'next-intl';
import { getLocale } from 'next-intl/server';

import { signIn } from '@/auth';
import { redirect } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { isOAuthProviderEnabled } from '@/modules/auth/oauth-providers';
import {
  ACCOUNT_DELETION_CONFIRM_PATHNAME,
  NEXT_DELETE_CONFIRM,
} from '@/modules/users/deletion-token-cookie';

/**
 * OAuth 로그인 시작 — 얇은 어댑터. 실제 인가·계정 정책은 Auth.js callback →
 * modules/auth/oauth.ts(단일 정책 지점)와 custom adapter가 강제한다.
 *
 * redirectTo는 flow를 시작한 locale의 홈 경로다. 이 값이 Auth.js callback-url
 * 쿠키로 콜백까지 운반되어 신규 가입 preferredLanguage의 근거가 된다
 * (modules/auth/oauth-request-context.ts). getPathname 대신 수동 prefix를
 * 쓰는 이유는 modules/auth/emails.ts의 기존 주석 참고.
 */
export async function signInWithOAuthProvider(
  providerId: string,
  formData?: FormData,
): Promise<void> {
  const requestLocale = await getLocale();
  const locale = hasLocale(routing.locales, requestLocale) ? requestLocale : routing.defaultLocale;

  // 비활성 provider는 버튼이 렌더되지 않는다 — 직접 호출(오래된 폼 등)은 조용히 로그인으로
  if (!isOAuthProviderEnabled(providerId)) {
    redirect({ href: '/login', locale });
    return;
  }

  // 복귀 대상은 whitelist 키만 해석한다 (open redirect 방지). locale prefix는 유지 —
  // 이 경로가 신규 가입 preferredLanguage 판정의 근거이기도 하다.
  const basePath =
    formData?.get('next') === NEXT_DELETE_CONFIRM ? ACCOUNT_DELETION_CONFIRM_PATHNAME : '/';
  const redirectTo =
    locale === routing.defaultLocale
      ? basePath
      : basePath === '/'
        ? `/${locale}`
        : `/${locale}${basePath}`;
  await signIn(providerId, { redirectTo });
}
