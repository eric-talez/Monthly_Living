import type { EmailMessage } from '@/adapters/email/types';
import { routing, type AppLocale } from '@/i18n/routing';
import { env } from '@/lib/env';
import en from '@/messages/en.json';
import ko from '@/messages/ko.json';

/**
 * 인증 관련 이메일 빌더.
 * 문구는 UI 문자열 규칙에 따라 src/messages/{ko,en}.json의 auth.emails에 둔다
 * (next-intl 요청 컨텍스트 밖에서도 동작해야 하므로 JSON을 직접 import).
 * URL은 문자열 연결 대신 new URL(localizedPath, APP_URL)로 만든다.
 */
const EMAIL_MESSAGES = { ko: ko.auth.emails, en: en.auth.emails } as const;

function resolveLocale(preferredLanguage: string): AppLocale {
  return preferredLanguage === 'en' ? 'en' : 'ko';
}

/**
 * localePrefix 'as-needed' 규칙(기본 로케일은 prefix 없음)을 routing 설정에서 직접
 * 적용한다. next-intl getPathname은 next/navigation(클라이언트 체인)을 끌고 와
 * Node 테스트에서 로드할 수 없다 — 라우트별 pathnames 지역화를 도입하면 이 헬퍼도
 * 함께 갱신해야 한다 (현재 pathnames 미사용).
 */
function absoluteAuthUrl(locale: AppLocale, pathname: string, token: string): string {
  const prefixed = locale === routing.defaultLocale ? pathname : `/${locale}${pathname}`;
  const url = new URL(prefixed, env.APP_URL);
  url.searchParams.set('token', token);
  return url.toString();
}

export function buildVerificationEmail(params: {
  to: string;
  preferredLanguage: string;
  rawToken: string;
}): EmailMessage {
  const locale = resolveLocale(params.preferredLanguage);
  const template = EMAIL_MESSAGES[locale].verification;
  const url = absoluteAuthUrl(locale, '/verify-email', params.rawToken);
  return { to: params.to, subject: template.subject, text: template.body.replace('{url}', url) };
}

export function buildPasswordResetEmail(params: {
  to: string;
  preferredLanguage: string;
  rawToken: string;
}): EmailMessage {
  const locale = resolveLocale(params.preferredLanguage);
  const template = EMAIL_MESSAGES[locale].passwordReset;
  const url = absoluteAuthUrl(locale, '/reset-password', params.rawToken);
  return { to: params.to, subject: template.subject, text: template.body.replace('{url}', url) };
}

/** 계정 탈퇴 확인 메일 — 링크의 token 쿼리는 proxy에서 HttpOnly cookie로 교환된다. */
export function buildAccountDeletionEmail(params: {
  to: string;
  preferredLanguage: string;
  rawToken: string;
}): EmailMessage {
  const locale = resolveLocale(params.preferredLanguage);
  const template = EMAIL_MESSAGES[locale].accountDeletion;
  const url = absoluteAuthUrl(locale, '/settings/account/delete/confirm', params.rawToken);
  return { to: params.to, subject: template.subject, text: template.body.replace('{url}', url) };
}
