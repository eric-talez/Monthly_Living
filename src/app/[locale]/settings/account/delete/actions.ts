'use server';

import { hasLocale } from 'next-intl';
import { getLocale, getTranslations } from 'next-intl/server';
import { headers } from 'next/headers';

import { redirect } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { apiFail, type ApiFailure } from '@/lib/api-response';
import { ERROR_CODES, isAppError } from '@/lib/errors';
import { getClientIp } from '@/lib/request-ip';
import { getSession } from '@/lib/session';
import { requestAccountDeletion } from '@/modules/users/account-deletion';

export type RequestDeletionActionState = ApiFailure | null;

/**
 * 탈퇴 확인 메일 요청 — 얇은 어댑터. 자격·차단 판정은 전부
 * modules/users/account-deletion.ts(단일 정책 지점)가 강제한다.
 * 응답은 일반화 메시지만 사용한다 — 내부 상태·차단 사유 상세를 노출하지 않는다.
 * 폼 입력을 사용하지 않으므로 useActionState 인자(prev, formData)를 받지 않는다.
 */
export async function requestDeletionAction(): Promise<RequestDeletionActionState> {
  const tAuth = await getTranslations('auth');
  const tRequest = await getTranslations('settings.accountDeletion.request');

  const requestLocale = await getLocale();
  const locale = hasLocale(routing.locales, requestLocale) ? requestLocale : routing.defaultLocale;

  const session = await getSession();
  if (!session?.user) {
    redirect({ href: '/login', locale });
    return null;
  }
  // 세션 클레임으로 1차 차단 — 서비스가 DB 기준으로 재검증한다
  if (session.user.role !== 'TRAVELER') {
    return apiFail(ERROR_CODES.FORBIDDEN, tRequest('unsupported'));
  }

  let result;
  try {
    result = await requestAccountDeletion(
      { sessionUserId: session.user.id },
      { ipAddress: getClientIp(await headers()), locale },
    );
  } catch (error) {
    if (isAppError(error) && error.code === ERROR_CODES.RATE_LIMITED) {
      return apiFail(ERROR_CODES.RATE_LIMITED, tAuth('common.rateLimited'));
    }
    console.error('[users] 계정 탈퇴 요청 실패', error instanceof Error ? error.message : error);
    return apiFail(ERROR_CODES.INTERNAL_ERROR, tAuth('common.unexpectedError'));
  }

  if (result === 'unsupported') {
    return apiFail(ERROR_CODES.FORBIDDEN, tRequest('unsupported'));
  }
  if (result === 'blocked') {
    return apiFail(ERROR_CODES.CONFLICT, tRequest('blocked'));
  }

  redirect({ href: '/settings/account/delete/sent', locale });
  return null;
}
