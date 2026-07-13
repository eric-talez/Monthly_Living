'use server';

import { hasLocale } from 'next-intl';
import { getLocale } from 'next-intl/server';

import { signOut } from '@/auth';
import { redirect } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';

/** 헤더 로그아웃 — locale을 유지한 채 홈으로 돌려보낸다 */
export async function logoutAction(): Promise<void> {
  await signOut({ redirect: false });

  const requestLocale = await getLocale();
  redirect({
    href: '/',
    locale: hasLocale(routing.locales, requestLocale) ? requestLocale : routing.defaultLocale,
  });
}
