import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { cookies } from 'next/headers';

import { Link, redirect } from '@/i18n/navigation';
import { getSession } from '@/lib/session';
import { getAccountDeletionPreflight } from '@/modules/users/account-deletion';
import {
  NEXT_DELETE_CONFIRM,
  readDeletionTokenCookie,
} from '@/modules/users/deletion-token-cookie';

import { ConfirmDeletionForm } from './confirm-form';

// proxy의 X-Robots-Tag 헤더와 이중 방어 — 확인 화면은 색인 대상이 아니다
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * 탈퇴 확인 화면 (GET — DB 무변경).
 * token은 URL이 아니라 HttpOnly cookie에서 읽는다 — 이메일 링크의 token 쿼리는
 * proxy(src/proxy.ts)가 cookie로 교환하고 쿼리 없는 이 URL로 303 redirect한다.
 * preflight는 읽기 전용이며 실제 소비는 POST server action에서만 일어난다.
 */
export default async function ConfirmDeletionPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await getSession();
  if (!session?.user) {
    // token cookie는 유지된다 — 로그인 후 whitelist 키로 이 화면에 복귀한다
    redirect({ href: { pathname: '/login', query: { next: NEXT_DELETE_CONFIRM } }, locale });
    return null;
  }

  const t = await getTranslations('settings.accountDeletion.confirm');
  const cookieStore = await cookies();
  // 환경별 정식 cookie 이름으로만 읽는다 (production: __Secure- prefix)
  const rawToken = readDeletionTokenCookie(cookieStore, process.env.NODE_ENV === 'production');

  const preflight =
    rawToken === null
      ? ('missing' as const)
      : await getAccountDeletionPreflight({ sessionUserId: session.user.id, rawToken });

  const noticeKey =
    preflight === 'missing'
      ? 'missingToken'
      : preflight === 'ok'
        ? null
        : (preflight satisfies 'invalid' | 'expired' | 'blocked');

  return (
    <section aria-labelledby="confirm-deletion-heading">
      <h1 id="confirm-deletion-heading" className="font-serif text-3xl font-semibold">
        {t('title')}
      </h1>

      {noticeKey === null ? (
        <>
          <p
            role="alert"
            className="border-terracotta bg-terracotta/5 mt-6 border px-4 py-3 text-sm"
          >
            {t('warning')}
          </p>
          <ConfirmDeletionForm />
        </>
      ) : (
        <>
          <p
            role="alert"
            className="border-terracotta bg-terracotta/5 mt-6 border px-4 py-3 text-sm"
          >
            {t(noticeKey)}
          </p>
          <div className="mt-8 space-y-3 text-sm">
            <p>
              <Link href="/settings/account/delete" className="underline underline-offset-2">
                {t('requestAgainLink')}
              </Link>
            </p>
            <p>
              <Link
                href="/settings/account"
                className="text-muted-foreground underline underline-offset-2"
              >
                {t('backLink')}
              </Link>
            </p>
          </div>
        </>
      )}
    </section>
  );
}
