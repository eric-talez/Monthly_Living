'use server';

import { hasLocale } from 'next-intl';
import { getLocale, getTranslations } from 'next-intl/server';
import { revalidatePath } from 'next/cache';

import { redirect } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { apiFail, type ApiFailure } from '@/lib/api-response';
import { ERROR_CODES } from '@/lib/errors';
import { resetPassword } from '@/modules/auth/service';
import { resetPasswordSchema } from '@/modules/auth/validation';

import { fieldErrorsFrom } from '../validation-messages';

export type ResetPasswordActionState = ApiFailure | null;

export async function resetPasswordAction(
  _prev: ResetPasswordActionState,
  formData: FormData,
): Promise<ResetPasswordActionState> {
  const t = await getTranslations('auth');

  const parsed = resetPasswordSchema.safeParse({
    token: formData.get('token'),
    password: formData.get('password'),
    passwordConfirm: formData.get('passwordConfirm'),
  });
  if (!parsed.success) {
    return apiFail(ERROR_CODES.VALIDATION_ERROR, t('common.errorSummaryTitle'), {
      fieldErrors: fieldErrorsFrom(parsed.error, t),
    });
  }

  const result = await resetPassword({
    rawToken: parsed.data.token,
    newPassword: parsed.data.password,
  });

  if (result !== 'success') {
    // expired/invalid — 재요청 링크를 보여주기 위한 비민감 reason만 details에 담는다
    return apiFail(
      ERROR_CODES.VALIDATION_ERROR,
      result === 'expired' ? t('resetPassword.expired') : t('resetPassword.invalid'),
      { reason: result },
    );
  }

  // 재설정 직전까지 로그인 상태였다면 이 요청의 세션은 이미 무효지만(credentialVersion),
  // 루트 레이아웃(헤더)의 클라이언트 캐시가 남을 수 있어 레이아웃 재검증을 강제한다
  revalidatePath('/', 'layout');

  const requestLocale = await getLocale();
  redirect({
    href: { pathname: '/login', query: { reset: '1' } },
    locale: hasLocale(routing.locales, requestLocale) ? requestLocale : routing.defaultLocale,
  });
  return null;
}
