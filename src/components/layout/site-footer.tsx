import { useTranslations } from 'next-intl';

import { Container } from '@/components/ui/container';

export function SiteFooter() {
  const t = useTranslations('layout.footer');
  const year = new Date().getFullYear();

  return (
    <footer className="border-border border-t">
      <Container className="py-12">
        <p className="font-serif text-lg font-semibold">한달살기</p>
        <p className="text-muted-foreground mt-2 max-w-xl text-sm leading-relaxed">
          {t('description')}
        </p>
        <p className="text-muted-foreground mt-1 text-sm">{t('status')}</p>
        <p className="text-muted-foreground mt-8 text-xs">{t('copyright', { year })}</p>
      </Container>
    </footer>
  );
}
