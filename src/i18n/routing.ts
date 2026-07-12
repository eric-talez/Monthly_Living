import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['ko', 'en'],
  defaultLocale: 'ko',
  // 기본 로케일(ko)은 prefix 없이, 그 외 로케일만 /en 형태로 노출한다.
  localePrefix: 'as-needed',
});

export type AppLocale = (typeof routing.locales)[number];
