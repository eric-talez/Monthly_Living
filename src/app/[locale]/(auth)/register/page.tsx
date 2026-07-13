import { getTranslations, setRequestLocale } from 'next-intl/server';

import { redirect } from '@/i18n/navigation';
import { getSession } from '@/lib/session';

import { RegisterForm } from './register-form';

export default async function RegisterPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await getSession();
  if (session?.user) {
    redirect({ href: '/', locale });
  }

  const t = await getTranslations('auth');

  return (
    <section aria-labelledby="register-heading">
      <h1 id="register-heading" className="font-serif text-3xl font-semibold">
        {t('register.title')}
      </h1>
      <p className="text-muted-foreground mt-2 text-sm">{t('register.description')}</p>
      <RegisterForm />
    </section>
  );
}
