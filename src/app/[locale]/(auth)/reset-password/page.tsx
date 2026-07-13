import { getTranslations, setRequestLocale } from 'next-intl/server';

import { Link } from '@/i18n/navigation';

import { ResetPasswordForm } from './reset-password-form';

export default async function ResetPasswordPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('auth.resetPassword');

  const sp = await searchParams;
  const token = typeof sp.token === 'string' ? sp.token : null;

  return (
    <section aria-labelledby="reset-heading">
      <h1 id="reset-heading" className="font-serif text-3xl font-semibold">
        {t('title')}
      </h1>

      {token ? (
        <>
          <p className="text-muted-foreground mt-2 text-sm">{t('description')}</p>
          <ResetPasswordForm token={token} />
        </>
      ) : (
        <>
          <p
            role="alert"
            className="border-terracotta bg-terracotta/5 mt-6 border px-4 py-3 text-sm"
          >
            {t('missingToken')}
          </p>
          <p className="mt-6 text-sm">
            <Link href="/forgot-password" className="underline underline-offset-2">
              {t('requestAgainLink')}
            </Link>
          </p>
        </>
      )}
    </section>
  );
}
