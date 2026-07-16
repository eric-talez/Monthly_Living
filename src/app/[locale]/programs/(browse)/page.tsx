import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { EmptyState } from '@/components/programs/empty-state';
import { ProgramFilters } from '@/components/programs/program-filters';
import { ProgramList } from '@/components/programs/program-list';
import { ProgramPagination } from '@/components/programs/program-pagination';
import { ProgramSort } from '@/components/programs/program-sort';
import { Container } from '@/components/ui/container';
import { redirect } from '@/i18n/navigation';
import { resolveCanonicalQuery } from '@/modules/programs/query';
import { getProgramListFacets, listPublicPrograms } from '@/modules/programs/service';

type RawSearchParams = Record<string, string | string[] | undefined>;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'programs' });
  return { title: t('title'), description: t('subtitle') };
}

export default async function ProgramsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<RawSearchParams>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { query, canonicalSearch, isCanonical } = resolveCanonicalQuery(await searchParams);
  if (!isCanonical) {
    redirect({ href: canonicalSearch ? `/programs?${canonicalSearch}` : '/programs', locale });
  }

  const t = await getTranslations('programs');
  const [result, facets] = await Promise.all([listPublicPrograms(query), getProgramListFacets()]);

  return (
    <Container>
      <section className="py-12 sm:py-16">
        <header className="max-w-2xl">
          <h1 className="font-serif text-3xl leading-tight font-semibold sm:text-4xl">
            {t('title')}
          </h1>
          <p className="text-muted-foreground mt-3 leading-relaxed">{t('subtitle')}</p>
        </header>

        <div className="border-border mt-8 flex flex-col gap-4 border-b pb-6 lg:flex-row lg:items-end lg:justify-between">
          <ProgramFilters facets={facets} query={query} />
          <ProgramSort query={query} />
        </div>

        <p className="text-muted-foreground mt-6 text-sm" aria-live="polite">
          {t('results.count', { count: result.total })}
        </p>

        <div className="mt-6">
          {result.items.length === 0 ? (
            <EmptyState />
          ) : (
            <ProgramList items={result.items} locale={locale} />
          )}
        </div>

        <ProgramPagination query={query} page={result.page} totalPages={result.totalPages} />
      </section>
    </Container>
  );
}
