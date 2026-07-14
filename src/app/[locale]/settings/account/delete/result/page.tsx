import { getTranslations, setRequestLocale } from 'next-intl/server';

import { Link, redirect } from '@/i18n/navigation';
import { getSession } from '@/lib/session';

/** 결과는 비민감 enum status로만 전달된다 — 토큰·이메일·차단 사유 상세는 URL에 없다 */
const RESULT_KEYS = {
  invalid: 'invalid',
  expired: 'expired',
  blocked: 'blocked',
  error: 'error',
} as const;

type ResultStatus = keyof typeof RESULT_KEYS;

/** 실패 결과 전용 화면 — 성공 시에는 signOut 후 /login?deleted=1로 이동한다 */
export default async function DeletionResultPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await getSession();
  if (!session?.user) {
    redirect({ href: '/login', locale });
    return null;
  }

  const t = await getTranslations('settings.accountDeletion.result');

  const sp = await searchParams;
  const status: ResultStatus =
    typeof sp.status === 'string' && sp.status in RESULT_KEYS
      ? (sp.status as ResultStatus)
      : 'invalid';
  const key = RESULT_KEYS[status];
  // invalid/expired는 재요청으로 해소 가능, blocked/error는 계정 설정에서 상태 확인
  const canRequestAgain = status === 'invalid' || status === 'expired';

  return (
    <section aria-labelledby="deletion-result-heading">
      <h1 id="deletion-result-heading" className="font-serif text-3xl font-semibold">
        {t(`${key}.title`)}
      </h1>
      <p role="status" className="text-muted-foreground mt-2 text-sm">
        {t(`${key}.description`)}
      </p>

      <div className="mt-8 space-y-3 text-sm">
        {canRequestAgain ? (
          <p>
            <Link href="/settings/account/delete" className="underline underline-offset-2">
              {t('requestAgainLink')}
            </Link>
          </p>
        ) : null}
        <p>
          <Link
            href="/settings/account"
            className="text-muted-foreground underline underline-offset-2"
          >
            {t('backToAccountLink')}
          </Link>
        </p>
      </div>
    </section>
  );
}
