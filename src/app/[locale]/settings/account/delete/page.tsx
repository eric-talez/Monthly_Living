import { getTranslations, setRequestLocale } from 'next-intl/server';

import { maskEmailAddress } from '@/adapters/email/console';
import { Link, redirect } from '@/i18n/navigation';
import { getSession } from '@/lib/session';

import { RequestDeletionForm } from './request-form';

export default async function DeleteAccountPage({
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

  const t = await getTranslations('settings.accountDeletion.request');

  // EXPERT/ADMIN은 self-service 탈퇴 미지원 — 내부 상태·보유 기록을 노출하지 않는
  // 일반화 안내만 표시하고 폼·메일 발송 경로 자체를 렌더하지 않는다 (fail-closed).
  if (session.user.role !== 'TRAVELER') {
    return (
      <section aria-labelledby="delete-heading">
        <h1 id="delete-heading" className="font-serif text-3xl font-semibold">
          {t('title')}
        </h1>
        <p role="status" className="border-border bg-muted mt-6 border px-4 py-3 text-sm">
          {t('unsupported')}
        </p>
        <p className="mt-6 text-sm">
          <Link
            href="/settings/account"
            className="text-muted-foreground underline underline-offset-2"
          >
            {t('backLink')}
          </Link>
        </p>
      </section>
    );
  }

  const maskedEmail = maskEmailAddress(session.user.email ?? '');

  return (
    <section aria-labelledby="delete-heading">
      <h1 id="delete-heading" className="font-serif text-3xl font-semibold">
        {t('title')}
      </h1>
      <p className="text-muted-foreground mt-2 text-sm">{t('description')}</p>

      <div className="border-terracotta bg-terracotta/5 mt-6 space-y-4 border p-4 text-sm">
        <div>
          <h2 className="text-terracotta-strong font-medium">{t('deleted.title')}</h2>
          <ul className="text-muted-foreground mt-2 list-inside list-disc space-y-1">
            <li>{t('deleted.profile')}</li>
            <li>{t('deleted.social')}</li>
            <li>{t('deleted.favorites')}</li>
            <li>{t('deleted.notifications')}</li>
          </ul>
        </div>
        <div>
          <h2 className="font-medium">{t('kept.title')}</h2>
          <ul className="text-muted-foreground mt-2 list-inside list-disc space-y-1">
            <li>{t('kept.bookings')}</li>
            <li>{t('kept.reviews')}</li>
            <li>{t('kept.consents')}</li>
          </ul>
        </div>
        <p className="text-muted-foreground">{t('note')}</p>
      </div>

      <p className="text-muted-foreground mt-6 text-sm">
        {t('emailNotice', { email: maskedEmail })}
      </p>

      <RequestDeletionForm />

      <p className="mt-6 text-sm">
        <Link
          href="/settings/account"
          className="text-muted-foreground underline underline-offset-2"
        >
          {t('backLink')}
        </Link>
      </p>
    </section>
  );
}
