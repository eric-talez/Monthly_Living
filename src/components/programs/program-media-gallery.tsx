import { getTranslations } from 'next-intl/server';

import type { PublicProgramMedia } from '@/modules/programs/types';

/**
 * 상세 이미지 갤러리 — 첫 이미지를 hero, 나머지를 responsive grid로 표시한다.
 * media가 없으면 아무것도 렌더하지 않는다(빈 섹션 숨김). VIDEO는 service에서 이미 제외됨.
 * next/image 원격 도메인 설정을 도입하지 않으므로 목록 카드와 동일하게 plain <img>를 쓴다(2A 정책).
 */
export async function ProgramMediaGallery({
  media,
  title,
}: {
  media: PublicProgramMedia[];
  title: string;
}) {
  if (media.length === 0) {
    return null;
  }

  const t = await getTranslations('programs.detail');
  const [hero, ...rest] = media;
  const altFor = (item: PublicProgramMedia) => item.altText ?? t('imageAlt', { title });

  return (
    <section className="mt-8" aria-label={t('mediaLabel')}>
      <div className="bg-muted aspect-[16/9] w-full overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element -- 외부 seed 이미지, next/image 원격 도메인 설정을 도입하지 않는다(2A 정책 일관) */}
        <img src={hero.url} alt={altFor(hero)} className="h-full w-full object-cover" />
      </div>

      {rest.length > 0 ? (
        <ul role="list" className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {rest.map((item) => (
            <li key={item.id} className="bg-muted aspect-[3/2] overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element -- 위와 동일 */}
              <img
                src={item.url}
                alt={altFor(item)}
                loading="lazy"
                className="h-full w-full object-cover"
              />
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
