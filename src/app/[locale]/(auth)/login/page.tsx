import { getTranslations, setRequestLocale } from 'next-intl/server';

import { redirect } from '@/i18n/navigation';
import { getSession } from '@/lib/session';

import { LoginForm } from './login-form';

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await getSession();
  if (session?.user) {
    redirect({ href: '/', locale });
  }

  const t = await getTranslations('auth');
  const sp = await searchParams;
  // 비민감 enum 플래그만 사용한다 — 원문 값·토큰을 query로 전달하지 않는다
  const showResetNotice = sp.reset === '1';
  const showAuthError = typeof sp.error === 'string';

  return (
    <section aria-labelledby="login-heading">
      <h1 id="login-heading" className="font-serif text-3xl font-semibold">
        {t('login.title')}
      </h1>
      <p className="text-muted-foreground mt-2 text-sm">{t('login.description')}</p>

      {showResetNotice ? (
        <p role="status" className="border-sage bg-sage/10 mt-6 border px-4 py-3 text-sm">
          {t('login.resetSuccessNotice')}
        </p>
      ) : null}
      {showAuthError ? (
        <p role="alert" className="border-terracotta bg-terracotta/5 mt-6 border px-4 py-3 text-sm">
          {t('login.genericError')}
        </p>
      ) : null}

      <LoginForm />
    </section>
  );
}
