import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';

import { setRequestLocale } from 'next-intl/server';

import { ProgramDetail } from '@/components/programs/program-detail';
import { getPublicProgramBySlug } from '@/modules/programs/service';

/**
 * 공개 프로그램 상세. 목록과 동일한 visibility 계약(PUBLIC_PROGRAM_WHERE)으로 조회하고,
 * 비공개·미존재·형식오류는 모두 하나의 null → notFound()로 수렴한다(존재/비공개 사유 미노출).
 *
 * generateMetadata와 페이지가 같은 loader를 공유한다. React.cache로 요청 단위 dedupe하여 유효
 * slug당 실제 DB 조회는 1회다(형식오류 slug는 parseProgramSlug에서 DB 조회 없이 0회).
 *
 * not-found 판정은 generateMetadata에서 수행한다 — 상위 programs/loading.tsx의 streaming
 * 경계보다 앞서 short-circuit되어야 200 shell이 commit되기 전에 정확한 404 status가 설정된다.
 * (page 컴포넌트의 notFound()는 렌더 경로용 방어선이다.)
 */
const loadProgram = cache((slug: string) => getPublicProgramBySlug(slug));

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const program = await loadProgram(slug);

  // 비공개·미존재는 프로그램 title/description을 노출하지 않고 not-found(layout 기본 metadata)로 수렴.
  if (!program) {
    notFound();
  }

  return { title: program.title, description: program.shortDescription };
}

export default async function ProgramDetailPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const program = await loadProgram(slug);
  if (!program) {
    notFound();
  }

  return <ProgramDetail program={program} locale={locale} />;
}
