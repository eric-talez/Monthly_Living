import { getTranslations } from 'next-intl/server';

import { Link } from '@/i18n/navigation';
import { formatMoney } from '@/modules/programs/money';
import type { PublicProgramSummary } from '@/modules/programs/types';

/**
 * 목록 카드 — 프로그램 요약을 표시하고 제목을 상세(/programs/[slug])로 링크한다(2B).
 * 접근 가능한 이름은 제목이며, 예약·문의 등 미구현 기능의 동작하지 않는 CTA는 두지 않는다.
 */
export async function ProgramCard({
  program,
  locale,
}: {
  program: PublicProgramSummary;
  locale: string;
}) {
  const t = await getTranslations('programs.card');
  const isEn = locale === 'en';
  const cityName = isEn ? program.destination.cityNameEn : program.destination.cityNameKo;
  const countryName = isEn ? program.destination.countryNameEn : program.destination.countryNameKo;
  const categoryName = isEn ? program.category.nameEn : program.category.nameKo;
  const price = formatMoney(program.basePrice, program.currency, locale);

  return (
    <article className="bg-surface border-border flex h-full flex-col overflow-hidden border">
      <div className="bg-muted relative aspect-[3/2] w-full overflow-hidden">
        {program.thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element -- 외부 seed 이미지, next/image 원격 도메인 설정을 도입하지 않는다(2A 범위)
          <img
            src={program.thumbnail.url}
            alt={program.thumbnail.altText ?? ''}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="text-muted-foreground flex h-full w-full items-center justify-center text-xs">
            {t('noImage')}
          </div>
        )}
        {program.isOnline ? (
          <span className="bg-navy absolute top-2 left-2 px-2 py-0.5 text-xs font-medium text-white">
            {t('online')}
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col p-5">
        <p className="text-muted-foreground text-xs tracking-wide">
          {countryName} · {cityName} · {categoryName}
        </p>
        <h3 className="mt-2 font-serif text-lg leading-snug font-semibold text-balance">
          <Link href={`/programs/${program.slug}`} className="hover:underline">
            {program.title}
          </Link>
        </h3>
        <p className="text-foreground/75 mt-2 line-clamp-2 text-sm leading-relaxed">
          {program.shortDescription}
        </p>

        <dl className="text-muted-foreground mt-4 flex flex-wrap gap-x-3 gap-y-1 text-xs">
          <div className="flex gap-1">
            <dt className="sr-only">{t('durationLabel')}</dt>
            <dd>{t('days', { count: program.durationDays })}</dd>
          </div>
          <div className="flex gap-1">
            <dt className="sr-only">{t('sessionsLabel')}</dt>
            <dd>{t('sessions', { count: program.sessionCount })}</dd>
          </div>
          {program.averageRating !== null ? (
            <div className="flex gap-1">
              <dt className="sr-only">{t('ratingLabel')}</dt>
              <dd>
                {t('rating', { rating: program.averageRating.toFixed(1) })}
                {program.reviewCount > 0 ? ` ${t('reviews', { count: program.reviewCount })}` : ''}
              </dd>
            </div>
          ) : null}
        </dl>

        <p className="text-foreground mt-4 font-medium">{t('perPerson', { price })}</p>
      </div>
    </article>
  );
}
