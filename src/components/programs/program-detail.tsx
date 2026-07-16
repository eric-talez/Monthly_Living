import { getTranslations } from 'next-intl/server';

import { ProgramExpertSummary } from '@/components/programs/program-expert-summary';
import { ProgramMediaGallery } from '@/components/programs/program-media-gallery';
import { Container } from '@/components/ui/container';
import { Link } from '@/i18n/navigation';
import { formatMoney } from '@/modules/programs/money';
import type { PublicProgramDetail } from '@/modules/programs/types';

/**
 * 공개 프로그램 상세 뷰. 단일 h1(프로그램 제목) 아래 h2 섹션들로 구성한다.
 * Destination/Category는 locale별 Ko/En 필드를 쓰고, UI chrome만 messages를 사용한다
 * (program title/description은 임의 번역하지 않는다). 비어 있는 선택 섹션은 렌더하지 않는다.
 * 예약/문의/찜 등 미구현 기능의 동작하지 않는 CTA는 두지 않는다.
 */
export async function ProgramDetail({
  program,
  locale,
}: {
  program: PublicProgramDetail;
  locale: string;
}) {
  const t = await getTranslations('programs.detail');
  const tc = await getTranslations('programs.card');
  const isEn = locale === 'en';

  const cityName = isEn ? program.destination.cityNameEn : program.destination.cityNameKo;
  const countryName = isEn ? program.destination.countryNameEn : program.destination.countryNameKo;
  const categoryName = isEn ? program.category.nameEn : program.category.nameKo;
  const price = formatMoney(program.basePrice, program.currency, locale);
  const programTypeLabel =
    program.programType === 'GROUP' ? t('programType.GROUP') : t('programType.PRIVATE');
  const bookingTypeLabel =
    program.bookingType === 'INSTANT' ? t('bookingType.INSTANT') : t('bookingType.REQUEST');

  // 문자열 배열 섹션 — 비어 있으면 섹션 자체를 숨긴다.
  const listSections = [
    { key: 'includes', heading: t('includes'), items: program.includes },
    { key: 'excludes', heading: t('excludes'), items: program.excludes },
    { key: 'requirements', heading: t('requirements'), items: program.requirements },
    { key: 'languages', heading: t('languages'), items: program.languages },
  ].filter((section) => section.items.length > 0);

  const amenities = [
    program.petFriendly ? t('amenities.petFriendly') : null,
    program.childFriendly ? t('amenities.childFriendly') : null,
    program.accommodationIncluded ? t('amenities.accommodationIncluded') : null,
    program.transportIncluded ? t('amenities.transportIncluded') : null,
  ].filter((label): label is string => label !== null);

  const facts = [
    { key: 'price', label: t('facts.price'), value: tc('perPerson', { price }) },
    {
      key: 'duration',
      label: t('facts.duration'),
      value: tc('days', { count: program.durationDays }),
    },
    {
      key: 'sessions',
      label: t('facts.sessions'),
      value: tc('sessions', { count: program.sessionCount }),
    },
    {
      key: 'maxParticipants',
      label: t('facts.maxParticipants'),
      value: t('people', { count: program.maxParticipants }),
    },
    { key: 'programType', label: t('facts.programType'), value: programTypeLabel },
    { key: 'bookingType', label: t('facts.bookingType'), value: bookingTypeLabel },
    {
      key: 'format',
      label: t('facts.format'),
      value: program.isOnline ? tc('online') : t('offline'),
    },
  ];
  if (program.averageRating !== null) {
    const rating = tc('rating', { rating: program.averageRating.toFixed(1) });
    facts.push({
      key: 'rating',
      label: t('facts.rating'),
      value:
        program.reviewCount > 0
          ? `${rating} · ${tc('reviews', { count: program.reviewCount })}`
          : rating,
    });
  }

  return (
    <Container>
      <article className="py-10 sm:py-14">
        <Link
          href="/programs"
          className="text-muted-foreground hover:text-foreground text-sm transition-colors"
        >
          <span aria-hidden="true">←</span> {t('backToList')}
        </Link>

        <header className="mt-4 max-w-3xl">
          <p className="text-muted-foreground text-xs tracking-wide">
            {countryName} · {cityName} · {categoryName}
          </p>
          <h1 className="mt-2 font-serif text-3xl leading-tight font-semibold text-balance sm:text-4xl">
            {program.title}
          </h1>
          <p className="text-muted-foreground mt-3 leading-relaxed">{program.shortDescription}</p>
        </header>

        <ProgramMediaGallery media={program.media} title={program.title} />

        <dl className="border-border mt-8 grid grid-cols-2 gap-x-6 gap-y-4 border-y py-6 sm:grid-cols-4">
          {facts.map((fact) => (
            <div key={fact.key}>
              <dt className="text-muted-foreground text-xs">{fact.label}</dt>
              <dd className="text-foreground mt-1 font-medium">{fact.value}</dd>
            </div>
          ))}
        </dl>

        <section className="mt-10 max-w-3xl">
          <h2 className="font-serif text-xl font-semibold">{t('about')}</h2>
          <p className="text-foreground/80 mt-3 leading-relaxed whitespace-pre-line">
            {program.fullDescription}
          </p>
        </section>

        {listSections.map((section) => (
          <section key={section.key} className="mt-8 max-w-3xl">
            <h2 className="font-serif text-xl font-semibold">{section.heading}</h2>
            <ul
              role="list"
              className="text-foreground/80 mt-3 flex flex-col gap-1.5 text-sm leading-relaxed"
            >
              {section.items.map((item, index) => (
                <li key={`${section.key}-${index}`} className="flex gap-2">
                  <span aria-hidden="true" className="text-muted-foreground">
                    ·
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}

        {program.meetingPoint ? (
          <section className="mt-8 max-w-3xl">
            <h2 className="font-serif text-xl font-semibold">{t('meetingPoint')}</h2>
            <p className="text-foreground/80 mt-3 leading-relaxed whitespace-pre-line">
              {program.meetingPoint}
            </p>
          </section>
        ) : null}

        <section className="mt-8 max-w-3xl">
          <h2 className="font-serif text-xl font-semibold">{t('cancellationPolicy')}</h2>
          <p className="text-foreground/80 mt-3 leading-relaxed whitespace-pre-line">
            {program.cancellationPolicy}
          </p>
        </section>

        {amenities.length > 0 ? (
          <section className="mt-8 max-w-3xl">
            <h2 className="font-serif text-xl font-semibold">{t('amenitiesHeading')}</h2>
            <ul role="list" className="mt-3 flex flex-wrap gap-2">
              {amenities.map((label) => (
                <li
                  key={label}
                  className="border-border bg-muted text-foreground/80 border px-3 py-1 text-sm"
                >
                  {label}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <ProgramExpertSummary expert={program.expert} />
      </article>
    </Container>
  );
}
