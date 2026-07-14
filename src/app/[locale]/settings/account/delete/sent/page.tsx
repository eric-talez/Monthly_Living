import { getTranslations, setRequestLocale } from 'next-intl/server';

import { Link, redirect } from '@/i18n/navigation';
import { getSession } from '@/lib/session';

export default async function DeletionEmailSentPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await getSession();
  if (!session?.user) {
    redirect({ href: '/login', locale });
    return null;
  }

  const t = await getTranslations('settings.accountDeletion.sent');
  const tRequest = await getTranslations('settings.accountDeletion.request');

  return (
    <section aria-labelledby="deletion-sent-heading">
      <h1 id="deletion-sent-heading" className="font-serif text-3xl font-semibold">
        {t('title')}
      </h1>
      <p role="status" className="border-sage bg-sage/10 mt-6 border px-4 py-3 text-sm">
        {t('description')}
      </p>
      <p className="text-muted-foreground mt-4 text-sm">{t('note')}</p>

      <p className="mt-8 text-sm">
        <Link
          href="/settings/account"
          className="text-muted-foreground underline underline-offset-2"
        >
          {tRequest('backLink')}
        </Link>
      </p>
    </section>
  );
}
