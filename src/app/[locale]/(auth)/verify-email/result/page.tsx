import { getTranslations, setRequestLocale } from 'next-intl/server';

import { Link } from '@/i18n/navigation';

/** 결과는 비민감 enum status로만 전달된다 — 토큰·이메일 원문은 URL에 없다 */
const RESULT_KEYS = {
  verified: 'verified',
  'already-verified': 'alreadyVerified',
  expired: 'expired',
  invalid: 'invalid',
} as const;

type ResultStatus = keyof typeof RESULT_KEYS;

export default async function VerifyEmailResultPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('auth.verifyEmail.result');

  const sp = await searchParams;
  const status: ResultStatus =
    typeof sp.status === 'string' && sp.status in RESULT_KEYS
      ? (sp.status as ResultStatus)
      : 'invalid';
  const key = RESULT_KEYS[status];
  const succeeded = status === 'verified' || status === 'already-verified';

  return (
    <section aria-labelledby="verify-result-heading">
      <h1 id="verify-result-heading" className="font-serif text-3xl font-semibold">
        {t(`${key}.title`)}
      </h1>
      <p role="status" className="text-muted-foreground mt-2 text-sm">
        {t(`${key}.description`)}
      </p>

      <div className="mt-8 space-y-3 text-sm">
        {succeeded ? (
          <Link
            href="/login"
            className="bg-navy hover:bg-navy-strong inline-flex px-6 py-3 font-medium text-white transition-colors"
          >
            {t('loginLink')}
          </Link>
        ) : (
          <Link href="/verify-email/sent" className="underline underline-offset-2">
            {t('resendLink')}
          </Link>
        )}
      </div>
    </section>
  );
}
