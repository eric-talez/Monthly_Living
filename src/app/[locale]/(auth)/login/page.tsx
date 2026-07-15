import { getTranslations, setRequestLocale } from 'next-intl/server';

import { OAuthButtons } from '@/components/auth/oauth-buttons';
import { redirect } from '@/i18n/navigation';
import { getSession } from '@/lib/session';
import {
  ACCOUNT_DELETION_CONFIRM_PATHNAME,
  NEXT_DELETE_CONFIRM,
} from '@/modules/users/deletion-token-cookie';

import { LoginForm } from './login-form';

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const sp = await searchParams;
  // 로그인 복귀는 whitelist 키만 허용한다 — 임의 경로 운반(open redirect) 금지
  const next = sp.next === NEXT_DELETE_CONFIRM ? NEXT_DELETE_CONFIRM : null;

  const session = await getSession();
  if (session?.user) {
    redirect({ href: next ? ACCOUNT_DELETION_CONFIRM_PATHNAME : '/post-login', locale });
  }

  const t = await getTranslations('auth');
  // 비민감 enum 플래그만 사용한다 — 원문 값·토큰을 query로 전달하지 않는다
  const showResetNotice = sp.reset === '1';
  const showDeletedNotice = sp.deleted === '1';
  // ?error=는 Auth.js redirect(pages.signIn/pages.error)에서 온다. 값 종류와
  // 무관하게 일반화 메시지 하나만 노출한다 — 내부 사유·계정 존재 여부 비노출.
  // CredentialsSignin(자격 증명 직접 POST 실패)만 기존 자격 증명 문구를 유지한다.
  const errorParam = typeof sp.error === 'string' ? sp.error : null;
  const authErrorMessage =
    errorParam === null
      ? null
      : errorParam === 'CredentialsSignin'
        ? t('login.genericError')
        : t('login.oauthError');

  return (
    <section aria-labelledby="login-heading">
      <h1 id="login-heading" className="font-serif text-3xl font-semibold">
        {t('login.title')}
      </h1>
      <p className="text-muted-foreground mt-2 text-sm">{t('login.description')}</p>

      {showResetNotice ? (
        <p role="status" className="border-sage bg-sage/10 mt-6 border px-4 py-3 text-sm">
          {t('login.resetSuccessNotice')}
        </p>
      ) : null}
      {showDeletedNotice ? (
        <p role="status" className="border-sage bg-sage/10 mt-6 border px-4 py-3 text-sm">
          {t('login.deletedNotice')}
        </p>
      ) : null}
      {authErrorMessage ? (
        <p role="alert" className="border-terracotta bg-terracotta/5 mt-6 border px-4 py-3 text-sm">
          {authErrorMessage}
        </p>
      ) : null}

      <LoginForm next={next} />
      <OAuthButtons next={next} />
    </section>
  );
}
