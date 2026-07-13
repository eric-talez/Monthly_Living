'use server';

import { hasLocale } from 'next-intl';
import { getLocale, getTranslations } from 'next-intl/server';
import { headers } from 'next/headers';

import { redirect } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { apiFail, apiOk, type ApiResponse } from '@/lib/api-response';
import { ERROR_CODES, isAppError } from '@/lib/errors';
import { getClientIp } from '@/lib/request-ip';
import { resendVerificationEmail, verifyEmail } from '@/modules/auth/service';
import { emailOnlySchema } from '@/modules/auth/validation';

import { fieldErrorsFrom } from '../validation-messages';

async function resolveLocale() {
  const requestLocale = await getLocale();
  return hasLocale(routing.locales, requestLocale) ? requestLocale : routing.defaultLocale;
}

/**
 * 인증 확인 — GET 페이지의 버튼 POST로만 토큰을 소비한다 (스캐너 prefetch 안전).
 * 결과는 비민감 enum status로만 결과 페이지에 전달한다 (토큰·이메일 원문 금지).
 */
export async function confirmVerificationAction(formData: FormData): Promise<void> {
  const locale = await resolveLocale();
  const token = formData.get('token');

  const status =
    typeof token === 'string' && token.length > 0 ? await verifyEmail(token) : 'invalid';

  redirect({ href: { pathname: '/verify-email/result', query: { status } }, locale });
}

export type ResendActionState = ApiResponse<{ done: true }> | null;

export async function resendVerificationAction(
  _prev: ResendActionState,
  formData: FormData,
): Promise<ResendActionState> {
  const t = await getTranslations('auth');

  const parsed = emailOnlySchema.safeParse({ email: formData.get('email') });
  if (!parsed.success) {
    return apiFail(ERROR_CODES.VALIDATION_ERROR, t('common.errorSummaryTitle'), {
      fieldErrors: fieldErrorsFrom(parsed.error, t),
    });
  }

  try {
    // 미가입·이미 인증된 이메일도 동일한 성공 응답 (계정 열거 방지)
    await resendVerificationEmail(parsed.data, {
      ipAddress: getClientIp(await headers()),
      locale: await resolveLocale(),
    });
  } catch (error) {
    if (isAppError(error) && error.code === ERROR_CODES.RATE_LIMITED) {
      return apiFail(ERROR_CODES.RATE_LIMITED, t('common.rateLimited'));
    }
    console.error('[auth] 인증 메일 재전송 실패', error instanceof Error ? error.message : error);
    return apiFail(ERROR_CODES.INTERNAL_ERROR, t('common.unexpectedError'));
  }

  return apiOk({ done: true });
}
