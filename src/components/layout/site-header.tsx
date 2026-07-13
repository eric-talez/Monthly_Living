import { getTranslations } from 'next-intl/server';

import { logoutAction } from '@/components/layout/header-actions';
import { LocaleSwitcher } from '@/components/layout/locale-switcher';
import { Container } from '@/components/ui/container';
import { Link } from '@/i18n/navigation';
import { getSession } from '@/lib/session';

export async function SiteHeader() {
  const t = await getTranslations('layout.header');
  // 세션 표시를 위해 헤더가 요청 시 렌더링된다 (getSession은 요청당 dedupe — lib/session.ts)
  const session = await getSession();

  return (
    <header className="border-border bg-background/95 border-b">
      <Container className="flex h-16 items-center justify-between gap-4">
        <Link
          href="/"
          aria-label={t('homeLink')}
          className="font-serif text-xl font-semibold tracking-tight"
        >
          {t('brand')}
        </Link>
        <div className="flex items-center gap-4">
          {session?.user ? (
            <form action={logoutAction} className="flex items-center gap-3">
              <span className="text-muted-foreground hidden text-sm sm:inline">
                {t('signedInAs', { email: session.user.email ?? '' })}
              </span>
              <button
                type="submit"
                className="border-border hover:bg-muted border px-3 py-1.5 text-sm transition-colors"
              >
                {t('logoutButton')}
              </button>
            </form>
          ) : (
            <Link
              href="/login"
              className="border-border hover:bg-muted border px-3 py-1.5 text-sm transition-colors"
            >
              {t('loginLink')}
            </Link>
          )}
          <LocaleSwitcher />
        </div>
      </Container>
    </header>
  );
}
