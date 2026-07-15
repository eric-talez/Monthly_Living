import { getTranslations } from 'next-intl/server';

import { Link } from '@/i18n/navigation';
import { buildListHref } from '@/modules/programs/query';
import type { ProgramListQuery } from '@/modules/programs/types';

/**
 * 서버 렌더 pagination — 이전/다음은 크롤 가능한 실제 링크(no-JS 동작). totalPages<=1이면
 * 컨트롤을 렌더하지 않는다(빈 결과 계약: totalPages 0 → 미렌더).
 */
export async function ProgramPagination({
  query,
  page,
  totalPages,
}: {
  query: ProgramListQuery;
  page: number;
  totalPages: number;
}) {
  if (totalPages <= 1) {
    return null;
  }

  const t = await getTranslations('programs.pagination');
  const hasPrev = page > 1;
  const hasNext = page < totalPages;
  const linkClass = 'border-border hover:bg-muted border px-4 py-2 text-sm transition-colors';
  const disabledClass = 'border-border text-muted-foreground/50 border px-4 py-2 text-sm';

  return (
    <nav aria-label={t('label')} className="mt-10 flex items-center justify-between gap-4">
      {hasPrev ? (
        <Link
          href={buildListHref('/programs', query, { page: page - 1 })}
          rel="prev"
          className={linkClass}
        >
          {t('previous')}
        </Link>
      ) : (
        <span aria-disabled="true" className={disabledClass}>
          {t('previous')}
        </span>
      )}

      <span aria-current="page" className="text-muted-foreground text-sm">
        {t('pageInfo', { page, totalPages })}
      </span>

      {hasNext ? (
        <Link
          href={buildListHref('/programs', query, { page: page + 1 })}
          rel="next"
          className={linkClass}
        >
          {t('next')}
        </Link>
      ) : (
        <span aria-disabled="true" className={disabledClass}>
          {t('next')}
        </span>
      )}
    </nav>
  );
}
