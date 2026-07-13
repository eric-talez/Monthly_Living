import { getTranslations, setRequestLocale } from 'next-intl/server';

import { Link } from '@/i18n/navigation';

import { confirmVerificationAction } from './actions';

/**
 * 이메일 인증 확인 페이지 — GET은 어떤 DB 변경도 하지 않는다.
 * 메일 스캐너의 링크 prefetch가 단일 사용 토큰을 소모하지 못하도록
 * 실제 소비는 버튼 POST(server action)에서만 일어난다.
 */
export default async function VerifyEmailPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('auth.verifyEmail');

  const sp = await searchParams;
  const token = typeof sp.token === 'string' ? sp.token : null;

  return (
    <section aria-labelledby="verify-heading">
      <h1 id="verify-heading" className="font-serif text-3xl font-semibold">
        {t('confirm.title')}
      </h1>

      {token ? (
        <>
          <p className="text-muted-foreground mt-2 text-sm">{t('confirm.description')}</p>
          <form action={confirmVerificationAction} className="mt-8">
            <input type="hidden" name="token" value={token} />
            <button
              type="submit"
              className="bg-navy hover:bg-navy-strong w-full px-6 py-3 text-sm font-medium text-white transition-colors"
            >
              {t('confirm.submit')}
            </button>
          </form>
        </>
      ) : (
        <>
          <p
            role="alert"
            className="border-terracotta bg-terracotta/5 mt-6 border px-4 py-3 text-sm"
          >
            {t('confirm.missingToken')}
          </p>
          <p className="mt-6 text-sm">
            <Link href="/verify-email/sent" className="underline underline-offset-2">
              {t('result.resendLink')}
            </Link>
          </p>
        </>
      )}
    </section>
  );
}
