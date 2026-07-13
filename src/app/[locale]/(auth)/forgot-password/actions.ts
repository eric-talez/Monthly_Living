'use server';

import { hasLocale } from 'next-intl';
import { getLocale, getTranslations } from 'next-intl/server';
import { headers } from 'next/headers';

import { routing } from '@/i18n/routing';
import { apiFail, apiOk, type ApiResponse } from '@/lib/api-response';
import { ERROR_CODES, isAppError } from '@/lib/errors';
import { getClientIp } from '@/lib/request-ip';
import { requestPasswordReset } from '@/modules/auth/service';
import { emailOnlySchema } from '@/modules/auth/validation';

import { fieldErrorsFrom } from '../validation-messages';

export type ForgotPasswordActionState = ApiResponse<{ done: true }> | null;

export async function forgotPasswordAction(
  _prev: ForgotPasswordActionState,
  formData: FormData,
): Promise<ForgotPasswordActionState> {
  const t = await getTranslations('auth');

  const parsed = emailOnlySchema.safeParse({ email: formData.get('email') });
  if (!parsed.success) {
    return apiFail(ERROR_CODES.VALIDATION_ERROR, t('common.errorSummaryTitle'), {
      fieldErrors: fieldErrorsFrom(parsed.error, t),
    });
  }

  const requestLocale = await getLocale();
  try {
    // 이메일 존재 여부와 무관하게 동일한 성공 응답 (계정 열거 방지)
    await requestPasswordReset(parsed.data, {
      ipAddress: getClientIp(await headers()),
      locale: hasLocale(routing.locales, requestLocale) ? requestLocale : routing.defaultLocale,
    });
  } catch (error) {
    if (isAppError(error) && error.code === ERROR_CODES.RATE_LIMITED) {
      return apiFail(ERROR_CODES.RATE_LIMITED, t('common.rateLimited'));
    }
    console.error(
      '[auth] 비밀번호 재설정 요청 실패',
      error instanceof Error ? error.message : error,
    );
    return apiFail(ERROR_CODES.INTERNAL_ERROR, t('common.unexpectedError'));
  }

  return apiOk({ done: true });
}
