import { useTranslations } from 'next-intl';

import { Container } from '@/components/ui/container';
import { Link } from '@/i18n/navigation';

export default function NotFoundPage() {
  const t = useTranslations('notFound');

  return (
    <Container>
      <section className="py-24 text-center sm:py-32">
        <h1 className="font-serif text-3xl font-semibold sm:text-4xl">{t('title')}</h1>
        <p className="text-muted-foreground mt-4 text-base leading-relaxed">{t('description')}</p>
        <div className="mt-10">
          <Link
            href="/"
            className="bg-navy hover:bg-navy-strong inline-flex items-center px-6 py-3 text-sm font-medium text-white transition-colors"
          >
            {t('backHome')}
          </Link>
        </div>
      </section>
    </Container>
  );
}
