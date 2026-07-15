'use client';

import { useTranslations } from 'next-intl';

import { usePathname, useRouter } from '@/i18n/navigation';
import { PROGRAM_SORTS } from '@/modules/programs/constants';
import { buildListHref } from '@/modules/programs/query';
import type { ProgramListQuery } from '@/modules/programs/types';

const SORT_LABEL_KEY: Record<(typeof PROGRAM_SORTS)[number], string> = {
  featured: 'featured',
  price_asc: 'priceAsc',
  price_desc: 'priceDesc',
  rating: 'rating',
};

/** 정렬 컨트롤. 변경 시 canonical URL로 이동하고 page를 1로 리셋한다. */
export function ProgramSort({ query }: { query: ProgramListQuery }) {
  const t = useTranslations('programs.sort');
  const pathname = usePathname();
  const router = useRouter();

  return (
    <label className="text-muted-foreground text-xs font-medium">
      {t('label')}
      <select
        className="border-border bg-surface mt-1 block w-full border px-3 py-2 text-sm sm:w-48"
        value={query.sort}
        onChange={(event) =>
          router.push(
            buildListHref(pathname, query, {
              sort: event.target.value as ProgramListQuery['sort'],
              page: 1,
            }),
          )
        }
      >
        {PROGRAM_SORTS.map((sort) => (
          <option key={sort} value={sort}>
            {t(SORT_LABEL_KEY[sort])}
          </option>
        ))}
      </select>
    </label>
  );
}
