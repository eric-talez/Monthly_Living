import { getTranslations, setRequestLocale } from 'next-intl/server';

import { Container } from '@/components/ui/container';
import { redirect } from '@/i18n/navigation';
import { getSession } from '@/lib/session';
import { POST_LOGIN_DESTINATIONS } from '@/modules/onboarding/redirect';
import {
  getOnboardingFormOptions,
  loadOnboardingDraft,
  resolvePostLoginDestinationForUser,
} from '@/modules/onboarding/service';

import { OnboardingForm } from './onboarding-form';

export default async function OnboardingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await getSession();
  if (!session?.user) {
    redirect({ href: POST_LOGIN_DESTINATIONS.LOGIN, locale });
    return null;
  }

  // 동일 resolver 재사용 — 완료 TRAVELER·EXPERT·ADMIN·비ACTIVE는 여기로 오면 안 된다
  const destination = await resolvePostLoginDestinationForUser(session.user.id);
  if (destination !== POST_LOGIN_DESTINATIONS.ONBOARDING) {
    redirect({ href: destination, locale });
    return null;
  }

  const [options, draft] = await Promise.all([
    getOnboardingFormOptions(),
    loadOnboardingDraft(session.user.id),
  ]);

  const t = await getTranslations('onboarding');

  return (
    <Container className="py-12 sm:py-16">
      <section aria-labelledby="onboarding-heading" className="mx-auto max-w-2xl">
        <h1 id="onboarding-heading" className="font-serif text-3xl font-semibold">
          {t('title')}
        </h1>
        <p className="text-muted-foreground mt-2 text-sm">{t('description')}</p>
        <OnboardingForm options={options} draft={draft} locale={locale} />
      </section>
    </Container>
  );
}
