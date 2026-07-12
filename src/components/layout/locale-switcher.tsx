'use client';

import { useLocale, useTranslations } from 'next-intl';

import { Link, usePathname } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';

export function LocaleSwitcher() {
  const t = useTranslations('localeSwitcher');
  const currentLocale = useLocale();
  const pathname = usePathname();

  return (
    <nav aria-label={t('label')}>
      <ul className="flex items-center gap-1" role="list">
        {routing.locales.map((locale) => {
          const isActive = locale === currentLocale;

          return (
            <li key={locale} className="flex items-center">
              {isActive ? (
                <span aria-current="true" className="px-2 py-1 text-sm font-medium" lang={locale}>
                  {t('locale', { locale })}
                </span>
              ) : (
                <Link
                  href={pathname}
                  locale={locale}
                  className="text-muted-foreground hover:text-foreground px-2 py-1 text-sm transition-colors"
                  lang={locale}
                >
                  {t('locale', { locale })}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
