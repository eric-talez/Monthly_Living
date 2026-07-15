import { setRequestLocale } from 'next-intl/server';

import { redirect } from '@/i18n/navigation';
import { getSession } from '@/lib/session';
import { POST_LOGIN_DESTINATIONS } from '@/modules/onboarding/redirect';
import { resolvePostLoginDestinationForUser } from '@/modules/onboarding/service';

/**
 * Post-login dispatcher — UI가 없는 server-side 라우트. 세션 userId로 DB 상태를
 * 조회해 역할·온보딩 상태에 맞는 목적지로 redirect한다. 세션/DB만 신뢰하며 query의
 * next/role은 읽지 않는다 — 목적지는 resolver의 whitelist union으로만 제한된다
 * (open redirect 방지). 향후 dashboard가 생기면 resolver 반환값만 교체하면 된다.
 */
export default async function PostLoginPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await getSession();
  if (!session?.user) {
    redirect({ href: POST_LOGIN_DESTINATIONS.LOGIN, locale });
    return null;
  }

  const destination = await resolvePostLoginDestinationForUser(session.user.id);
  redirect({ href: destination, locale });
  return null;
}
