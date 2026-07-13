import { getTranslations, setRequestLocale } from 'next-intl/server';

import { ResendForm } from '../resend-form';

export default async function VerifyEmailSentPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('auth.verifyEmail.sent');

  return (
    <section aria-labelledby="verify-sent-heading">
      <h1 id="verify-sent-heading" className="font-serif text-3xl font-semibold">
        {t('title')}
      </h1>
      <p className="text-muted-foreground mt-2 text-sm">{t('description')}</p>
      <p className="text-muted-foreground mt-4 text-sm">{t('note')}</p>
      <ResendForm />
    </section>
  );
}
