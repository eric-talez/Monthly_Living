'use client';

import { useLocale, useTranslations } from 'next-intl';

import { usePathname, useRouter } from '@/i18n/navigation';
import { buildListHref } from '@/modules/programs/query';
import type { ProgramListFacets, ProgramListQuery } from '@/modules/programs/types';

/**
 * 필터 컨트롤(country/destination/category). 변경 시 canonical URL로 이동하고 page를 1로 리셋한다.
 * destination 옵션은 선택된 country로 스코프해 모순 조합 생성을 최소화한다(country 변경 시 destination 초기화).
 */
export function ProgramFilters({
  facets,
  query,
}: {
  facets: ProgramListFacets;
  query: ProgramListQuery;
}) {
  const t = useTranslations('programs.filters');
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const isEn = locale === 'en';

  const go = (patch: Partial<ProgramListQuery>) => {
    router.push(buildListHref(pathname, query, { ...patch, page: 1 }));
  };

  const destinations = query.country
    ? facets.destinations.filter((destination) => destination.countryCode === query.country)
    : facets.destinations;

  const hasFilters = Boolean(query.country ?? query.destination ?? query.category);
  const selectClass = 'border-border bg-surface mt-1 block w-full border px-3 py-2 text-sm sm:w-48';

  return (
    <div className="flex flex-wrap items-end gap-4">
      <label className="text-muted-foreground text-xs font-medium">
        {t('country')}
        <select
          className={selectClass}
          value={query.country ?? ''}
          onChange={(event) => go({ country: event.target.value || null, destination: null })}
        >
          <option value="">{t('all')}</option>
          {facets.countries.map((country) => (
            <option key={country.code} value={country.code}>
              {isEn ? country.nameEn : country.nameKo}
            </option>
          ))}
        </select>
      </label>

      <label className="text-muted-foreground text-xs font-medium">
        {t('destination')}
        <select
          className={selectClass}
          value={query.destination ?? ''}
          onChange={(event) => go({ destination: event.target.value || null })}
        >
          <option value="">{t('all')}</option>
          {destinations.map((destination) => (
            <option key={destination.slug} value={destination.slug}>
              {isEn ? destination.cityNameEn : destination.cityNameKo}
            </option>
          ))}
        </select>
      </label>

      <label className="text-muted-foreground text-xs font-medium">
        {t('category')}
        <select
          className={selectClass}
          value={query.category ?? ''}
          onChange={(event) => go({ category: event.target.value || null })}
        >
          <option value="">{t('all')}</option>
          {facets.categories.map((category) => (
            <option key={category.slug} value={category.slug}>
              {isEn ? category.nameEn : category.nameKo}
            </option>
          ))}
        </select>
      </label>

      {hasFilters ? (
        <button
          type="button"
          className="border-border hover:bg-muted border px-3 py-2 text-sm transition-colors"
          onClick={() =>
            router.push(
              buildListHref(pathname, query, {
                country: null,
                destination: null,
                category: null,
                page: 1,
              }),
            )
          }
        >
          {t('clear')}
        </button>
      ) : null}
    </div>
  );
}
