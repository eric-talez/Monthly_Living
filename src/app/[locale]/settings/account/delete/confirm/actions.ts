'use server';

import { hasLocale } from 'next-intl';
import { getLocale, getTranslations } from 'next-intl/server';
import { revalidatePath } from 'next/cache';
import { cookies, headers } from 'next/headers';

import { signOut } from '@/auth';
import { fieldErrorsFrom } from '@/app/[locale]/(auth)/validation-messages';
import { redirect } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { apiFail, type ApiFailure } from '@/lib/api-response';
import { ERROR_CODES } from '@/lib/errors';
import { getClientIp } from '@/lib/request-ip';
import { getSession } from '@/lib/session';
import { confirmDeletionCore } from '@/modules/users/account-deletion';
import { deletionCookiePath, NEXT_DELETE_CONFIRM } from '@/modules/users/deletion-token-cookie';
import { deleteAccountConfirmSchema } from '@/modules/users/validation';

export type ConfirmDeletionActionState = ApiFailure | null;

/**
 * 탈퇴 최종 확인 (POST에서만 토큰 소비) — 얇은 어댑터.
 * token은 폼이 아니라 HttpOnly cookie에서 읽고(confirmDeletionCore), 성공·실패·
 * 만료 결과 처리 후 cookie를 제거한다 (rate limit만 예외 — 재시도 허용).
 * sessionUserId는 오직 세션에서만 얻는다 — 폼 값은 의사 확인용 confirmText뿐이다.
 */
export async function confirmDeletionAction(
  _prev: ConfirmDeletionActionState,
  formData: FormData,
): Promise<ConfirmDeletionActionState> {
  const tAuth = await getTranslations('auth');

  const requestLocale = await getLocale();
  const locale = hasLocale(routing.locales, requestLocale) ? requestLocale : routing.defaultLocale;

  const session = await getSession();
  if (!session?.user) {
    redirect({ href: { pathname: '/login', query: { next: NEXT_DELETE_CONFIRM } }, locale });
    return null;
  }

  // 의사 확인 문구 검증 — 실패 시 cookie를 유지한 채 폼으로 되돌린다
  const parsed = deleteAccountConfirmSchema.safeParse({
    confirmText: formData.get('confirmText'),
  });
  if (!parsed.success) {
    return apiFail(ERROR_CODES.VALIDATION_ERROR, tAuth('common.errorSummaryTitle'), {
      fieldErrors: fieldErrorsFrom(parsed.error, tAuth),
    });
  }

  const cookieStore = await cookies();
  const outcome = await confirmDeletionCore({
    sessionUserId: session.user.id,
    ipAddress: getClientIp(await headers()),
    cookiePath: deletionCookiePath(locale),
    isProduction: process.env.NODE_ENV === 'production',
    cookieStore: {
      get: (name) => cookieStore.get(name),
      // Path 옵션 보장을 위해 set(maxAge: 0)으로 제거 — __Secure- 이름은 브라우저가
      // Secure 속성 없는 만료도 거부하므로 spec의 secure 플래그를 그대로 전달한다
      delete: ({ name, path, maxAge, httpOnly, sameSite, secure }) =>
        cookieStore.set(name, '', { path, maxAge, httpOnly, sameSite, secure }),
    },
  });

  if (outcome.kind === 'rate-limited') {
    return apiFail(ERROR_CODES.RATE_LIMITED, tAuth('common.rateLimited'));
  }

  if (outcome.kind === 'deleted') {
    // 세션 제거 후 localized login으로 — /login?deleted=1이 일반화된 완료 안내를 표시한다
    await signOut({ redirect: false });
    revalidatePath('/', 'layout');
    redirect({ href: { pathname: '/login', query: { deleted: '1' } }, locale });
    return null;
  }

  // 비민감 enum status만 URL로 전달한다
  redirect({
    href: { pathname: '/settings/account/delete/result', query: { status: outcome.status } },
    locale,
  });
  return null;
}
