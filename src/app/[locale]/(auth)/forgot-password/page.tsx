import { getTranslations, setRequestLocale } from 'next-intl/server';

import { ForgotPasswordForm } from './forgot-password-form';

export default async function ForgotPasswordPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('auth.forgotPassword');

  return (
    <section aria-labelledby="forgot-heading">
      <h1 id="forgot-heading" className="font-serif text-3xl font-semibold">
        {t('title')}
      </h1>
      <p className="text-muted-foreground mt-2 text-sm">{t('description')}</p>
      <ForgotPasswordForm />
    </section>
  );
}
