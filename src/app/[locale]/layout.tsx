import type { Metadata } from 'next';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import localFont from 'next/font/local';
import { notFound } from 'next/navigation';

import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import { routing } from '@/i18n/routing';

import '../globals.css';

// self-host된 Noto Sans/Serif KR (latin subset) — 빌드 시 Google Fonts 네트워크 의존 제거.
// weight·CSS 변수는 기존 next/font/google 계약을 그대로 유지한다. 폰트 원본·라이선스는
// src/fonts/SOURCE.md, src/fonts/OFL.txt 참고. (한글 글리프는 기존과 동일하게 시스템 폴백.)
const notoSansKr = localFont({
  src: [
    { path: '../../fonts/noto-sans-kr-latin-400.woff2', weight: '400', style: 'normal' },
    { path: '../../fonts/noto-sans-kr-latin-500.woff2', weight: '500', style: 'normal' },
    { path: '../../fonts/noto-sans-kr-latin-700.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-noto-sans-kr',
  display: 'swap',
});

const notoSerifKr = localFont({
  src: [
    { path: '../../fonts/noto-serif-kr-latin-400.woff2', weight: '400', style: 'normal' },
    { path: '../../fonts/noto-serif-kr-latin-600.woff2', weight: '600', style: 'normal' },
    { path: '../../fonts/noto-serif-kr-latin-700.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-noto-serif-kr',
  display: 'swap',
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'metadata' });

  return {
    title: t('title'),
    description: t('description'),
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);

  return (
    <html lang={locale} className={`${notoSansKr.variable} ${notoSerifKr.variable} antialiased`}>
      <body className="flex min-h-dvh flex-col">
        <NextIntlClientProvider>
          <SiteHeader />
          <main className="flex-1">{children}</main>
          <SiteFooter />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
