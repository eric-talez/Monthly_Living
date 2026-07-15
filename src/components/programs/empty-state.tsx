import { getTranslations } from 'next-intl/server';

import { Link } from '@/i18n/navigation';

/** 결과가 없을 때 — 필터를 초기화하는 실제 링크(/programs)를 제공한다. */
export async function EmptyState() {
  const t = await getTranslations('programs.empty');

  return (
    <div className="border-border bg-surface flex flex-col items-center border px-6 py-16 text-center">
      <p className="font-serif text-xl font-semibold">{t('title')}</p>
      <p className="text-muted-foreground mt-2 max-w-md text-sm leading-relaxed">
        {t('description')}
      </p>
      <Link
        href="/programs"
        className="border-border hover:bg-muted mt-6 border px-4 py-2 text-sm transition-colors"
      >
        {t('reset')}
      </Link>
    </div>
  );
}
