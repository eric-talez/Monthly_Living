import { getTranslations } from 'next-intl/server';

import type { PublicExpertSummary } from '@/modules/programs/types';

/**
 * 전문가 공개 요약 — 상세 하단에 표시한다. 공개 요약 필드만 받으며(PII·관리 필드는 DTO에 없음),
 * 이번 범위에서는 독립 전문가 페이지가 없으므로 링크·CTA를 두지 않는다.
 * 값이 없는 항목은 렌더하지 않는다.
 */
export async function ProgramExpertSummary({ expert }: { expert: PublicExpertSummary }) {
  const t = await getTranslations('programs.detail.expert');

  const facts: { key: string; label: string; value: string }[] = [
    {
      key: 'experience',
      label: t('experience'),
      value: t('years', { count: expert.yearsOfExperience }),
    },
  ];
  if (expert.languages.length > 0) {
    facts.push({
      key: 'languages',
      label: t('languagesLabel'),
      value: expert.languages.join(', '),
    });
  }
  if (expert.responseRate !== null) {
    facts.push({
      key: 'responseRate',
      label: t('responseRate'),
      value: t('percent', { value: expert.responseRate }),
    });
  }
  if (expert.responseTimeMinutes !== null) {
    facts.push({
      key: 'responseTime',
      label: t('responseTime'),
      value: t('minutes', { count: expert.responseTimeMinutes }),
    });
  }
  if (expert.averageRating !== null) {
    const rating = t('ratingValue', { rating: expert.averageRating.toFixed(1) });
    facts.push({
      key: 'rating',
      label: t('rating'),
      value:
        expert.reviewCount > 0
          ? `${rating} · ${t('reviews', { count: expert.reviewCount })}`
          : rating,
    });
  }
  if (expert.completedBookingCount > 0) {
    facts.push({
      key: 'completed',
      label: t('completed'),
      value: t('completedValue', { count: expert.completedBookingCount }),
    });
  }

  return (
    <section className="mt-10">
      <h2 className="font-serif text-xl font-semibold">{t('heading')}</h2>
      <div className="border-border bg-surface mt-4 border p-6">
        <p className="text-lg font-semibold">{expert.displayName}</p>

        {expert.identityVerified || expert.credentialVerified ? (
          <ul className="mt-3 flex flex-wrap gap-2">
            {expert.identityVerified ? (
              <li className="border-border text-foreground/70 border px-2 py-0.5 text-xs">
                {t('identityVerified')}
              </li>
            ) : null}
            {expert.credentialVerified ? (
              <li className="border-border text-foreground/70 border px-2 py-0.5 text-xs">
                {t('credentialVerified')}
              </li>
            ) : null}
          </ul>
        ) : null}

        <p className="text-foreground/80 mt-4 leading-relaxed whitespace-pre-line">{expert.bio}</p>

        <dl className="text-muted-foreground mt-6 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
          {facts.map((fact) => (
            <div key={fact.key}>
              <dt className="text-xs">{fact.label}</dt>
              <dd className="text-foreground mt-0.5">{fact.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
