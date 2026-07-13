'use server';

import { hasLocale } from 'next-intl';
import { getLocale, getTranslations } from 'next-intl/server';
import { headers } from 'next/headers';

import { routing } from '@/i18n/routing';
import { redirect } from '@/i18n/navigation';
import { apiFail, type ApiFailure } from '@/lib/api-response';
import { ERROR_CODES, isAppError } from '@/lib/errors';
import { getClientIp } from '@/lib/request-ip';
import { registerUser } from '@/modules/auth/service';
import { registerSchema } from '@/modules/auth/validation';

import { fieldErrorsFrom } from '../validation-messages';

export type RegisterActionState = ApiFailure | null;

export async function registerAction(
  _prev: RegisterActionState,
  formData: FormData,
): Promise<RegisterActionState> {
  const t = await getTranslations('auth');
  const requestLocale = await getLocale();
  const locale = hasLocale(routing.locales, requestLocale) ? requestLocale : routing.defaultLocale;

  const parsed = registerSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    passwordConfirm: formData.get('passwordConfirm'),
    termsAccepted: formData.get('termsAccepted') === 'on',
    privacyAccepted: formData.get('privacyAccepted') === 'on',
    marketingAccepted: formData.get('marketingAccepted') === 'on',
  });
  if (!parsed.success) {
    return apiFail(ERROR_CODES.VALIDATION_ERROR, t('common.errorSummaryTitle'), {
      fieldErrors: fieldErrorsFrom(parsed.error, t),
    });
  }

  try {
    // 신규/기존 계정 모두 동일한 성공 흐름 — 응답으로 계정 존재를 구분하지 않는다
    await registerUser(parsed.data, {
      ipAddress: getClientIp(await headers()),
      locale,
    });
  } catch (error) {
    if (isAppError(error) && error.code === ERROR_CODES.RATE_LIMITED) {
      return apiFail(ERROR_CODES.RATE_LIMITED, t('common.rateLimited'));
    }
    console.error('[auth] 회원가입 처리 실패', error instanceof Error ? error.message : error);
    return apiFail(ERROR_CODES.INTERNAL_ERROR, t('common.unexpectedError'));
  }

  redirect({ href: '/verify-email/sent', locale });
  return null;
}
