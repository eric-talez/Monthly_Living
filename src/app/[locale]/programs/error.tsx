'use client';

import { useTranslations } from 'next-intl';

import { Container } from '@/components/ui/container';

/**
 * 목록 에러 바운더리 — raw error/stack/DB 정보를 사용자에게 표시하지 않는다.
 * 일반화된 ko/en 문구 + 접근 가능한 alert + 재시도(reset)만 제공한다.
 */
export default function ProgramsError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('programs.error');

  return (
    <Container>
      <section className="py-16">
        <div
          role="alert"
          className="border-border bg-surface flex flex-col items-center border px-6 py-16 text-center"
        >
          <p className="font-serif text-xl font-semibold">{t('title')}</p>
          <p className="text-muted-foreground mt-2 max-w-md text-sm leading-relaxed">
            {t('description')}
          </p>
          <button
            type="button"
            onClick={reset}
            className="border-border hover:bg-muted mt-6 border px-4 py-2 text-sm transition-colors"
          >
            {t('retry')}
          </button>
        </div>
      </section>
    </Container>
  );
}
