import { useTranslations } from 'next-intl';

import { LocaleSwitcher } from '@/components/layout/locale-switcher';
import { Container } from '@/components/ui/container';
import { Link } from '@/i18n/navigation';

export function SiteHeader() {
  const t = useTranslations('layout.header');

  return (
    <header className="border-border bg-background/95 border-b">
      <Container className="flex h-16 items-center justify-between">
        <Link
          href="/"
          aria-label={t('homeLink')}
          className="font-serif text-xl font-semibold tracking-tight"
        >
          {t('brand')}
        </Link>
        <LocaleSwitcher />
      </Container>
    </header>
  );
}
