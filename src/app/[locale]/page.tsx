import { useTranslations } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { use } from 'react';

import { Container } from '@/components/ui/container';

const REGION_KEYS = ['jeju', 'thailand', 'vietnam'] as const;

export default function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = use(params);
  setRequestLocale(locale);

  const t = useTranslations('home');

  return (
    <Container>
      <section className="py-24 sm:py-32">
        <p className="text-sage-strong text-sm font-medium tracking-[0.2em] uppercase">
          {t('badge')}
        </p>
        <h1 className="mt-6 max-w-3xl font-serif text-4xl leading-tight font-semibold text-balance sm:text-5xl">
          {t('title')}
        </h1>
        <p className="text-muted-foreground mt-6 max-w-2xl text-lg leading-relaxed">
          {t('subtitle')}
        </p>
      </section>

      <section aria-labelledby="regions-heading" className="border-border border-t py-16 sm:py-20">
        <h2
          id="regions-heading"
          className="text-muted-foreground text-sm font-medium tracking-[0.2em] uppercase"
        >
          {t('regionsHeading')}
        </h2>
        <ul className="mt-8 grid gap-px sm:grid-cols-3" role="list">
          {REGION_KEYS.map((key) => (
            <li key={key} className="bg-surface border-border border p-8 sm:-ml-px sm:first:ml-0">
              <h3 className="font-serif text-2xl font-semibold">{t(`regions.${key}.name`)}</h3>
              <p className="text-muted-foreground mt-1 text-sm">{t(`regions.${key}.country`)}</p>
              <p className="text-foreground/80 mt-4 text-sm leading-relaxed">
                {t(`regions.${key}.cities`)}
              </p>
            </li>
          ))}
        </ul>
        <p className="text-muted-foreground mt-10 max-w-2xl text-sm leading-relaxed">
          {t('notice')}
        </p>
      </section>
    </Container>
  );
}
