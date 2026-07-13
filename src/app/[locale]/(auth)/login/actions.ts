'use server';

import { AuthError, CredentialsSignin } from 'next-auth';
import { getLocale, getTranslations } from 'next-intl/server';

import { signIn } from '@/auth';
import { redirect } from '@/i18n/navigation';
import { apiFail, type ApiFailure } from '@/lib/api-response';
import { ERROR_CODES } from '@/lib/errors';
import { loginSchema } from '@/modules/auth/validation';

export type LoginActionState = ApiFailure | null;

/**
 * 로그인 서버 액션 — 얇은 어댑터.
 * 검증·rate limit·LoginAttempt 기록은 전부 Auth.js authorize() → 서비스에서
 * 강제된다 (src/auth.ts). 여기서는 오류를 일반화된 메시지로 번역만 한다:
 * 미존재/비밀번호 불일치/미인증을 절대 구분해 노출하지 않는다.
 */
export async function loginAction(
  _prev: LoginActionState,
  formData: FormData,
): Promise<LoginActionState> {
  const t = await getTranslations('auth');

  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) {
    return apiFail(ERROR_CODES.UNAUTHORIZED, t('login.genericError'));
  }

  try {
    await signIn('credentials', { ...parsed.data, redirect: false });
  } catch (error) {
    if (error instanceof CredentialsSignin) {
      return error.code === 'rate_limited'
        ? apiFail(ERROR_CODES.RATE_LIMITED, t('common.rateLimited'))
        : apiFail(ERROR_CODES.UNAUTHORIZED, t('login.genericError'));
    }
    if (error instanceof AuthError) {
      return apiFail(ERROR_CODES.UNAUTHORIZED, t('login.genericError'));
    }
    throw error;
  }

  redirect({ href: '/', locale: await getLocale() });
  return null;
}
