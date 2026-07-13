import { getTranslations, setRequestLocale } from 'next-intl/server';

import { maskEmailAddress } from '@/adapters/email/console';
import { Link, redirect } from '@/i18n/navigation';
import { getSession } from '@/lib/session';

export default async function AccountSettingsPage({
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

  const t = await getTranslations('settings.account');
  // 이메일은 마스킹해서만 표시한다 — 화면 캡처·공유 시 노출 최소화
  const maskedEmail = maskEmailAddress(session.user.email ?? '');

  return (
    <section aria-labelledby="account-heading">
      <h1 id="account-heading" className="font-serif text-3xl font-semibold">
        {t('title')}
      </h1>
      <p className="text-muted-foreground mt-2 text-sm">{t('description')}</p>

      <dl className="border-border mt-8 border p-4 text-sm">
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-muted-foreground">{t('emailLabel')}</dt>
          <dd className="font-medium">{maskedEmail}</dd>
        </div>
      </dl>

      <section
        aria-labelledby="danger-zone-heading"
        className="border-terracotta bg-terracotta/5 mt-8 border p-4"
      >
        <h2 id="danger-zone-heading" className="text-terracotta-strong text-sm font-medium">
          {t('dangerZone.title')}
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">{t('dangerZone.description')}</p>
        <Link
          href="/settings/account/delete"
          className="border-terracotta text-terracotta-strong hover:bg-terracotta/10 mt-4 inline-flex border px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-2"
        >
          {t('dangerZone.deleteLink')}
        </Link>
      </section>
    </section>
  );
}
