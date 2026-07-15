import { useTranslations } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { use } from 'react';

import { Container } from '@/components/ui/container';
import { Link } from '@/i18n/navigation';

const REGION_KEYS = ['jeju', 'thailand', 'vietnam'] as const;

// 지역 타일 → 공개 목록 진입점(jeju는 도시, thailand/vietnam은 국가 필터).
const REGION_HREF: Record<(typeof REGION_KEYS)[number], string> = {
  jeju: '/programs?destination=jeju',
  thailand: '/programs?country=TH',
  vietnam: '/programs?country=VN',
};

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
        <div className="mt-10">
          <Link
            href="/programs"
            className="bg-sage-strong hover:bg-sage inline-block px-6 py-3 text-sm font-medium text-white transition-colors"
          >
            {t('cta.browse')}
          </Link>
        </div>
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
            <li key={key}>
              <Link
                href={REGION_HREF[key]}
                className="bg-surface border-border hover:border-sage-strong block h-full border p-8 transition-colors sm:-ml-px sm:first:ml-0"
              >
                <h3 className="font-serif text-2xl font-semibold">{t(`regions.${key}.name`)}</h3>
                <p className="text-muted-foreground mt-1 text-sm">{t(`regions.${key}.country`)}</p>
                <p className="text-foreground/80 mt-4 text-sm leading-relaxed">
                  {t(`regions.${key}.cities`)}
                </p>
                <span className="text-sage-strong mt-5 inline-block text-sm font-medium">
                  {t('cta.viewRegion', { region: t(`regions.${key}.name`) })}
                </span>
              </Link>
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
