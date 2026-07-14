import { getTranslations } from 'next-intl/server';

import { getEnabledOAuthProviderIds } from '@/modules/auth/oauth-providers';
import type { OAuthProviderId } from '@/modules/auth/oauth';

import { signInWithOAuthProvider } from './oauth-actions';

const BUTTON_LABEL_KEYS: Record<OAuthProviderId, string> = {
  google: 'oauth.continueWithGoogle',
  kakao: 'oauth.continueWithKakao',
};

/**
 * 활성화된 OAuth provider 버튼 섹션 (서버 컴포넌트).
 * env에 ID/secret이 모두 설정된 provider만 렌더한다 — 하나도 없으면 섹션 자체를
 * 그리지 않는다. 신규 가입 동의 고지는 버튼과 함께 항상 표시한다
 * (ConsentRecord 기록 근거 — docs/decisions/oauth-account-linking.md).
 */
export async function OAuthButtons({ next = null }: { next?: string | null }) {
  const providerIds = getEnabledOAuthProviderIds();
  if (providerIds.length === 0) {
    return null;
  }

  const t = await getTranslations('auth');

  return (
    <div className="mt-8 space-y-5">
      <div className="flex items-center gap-3">
        <span aria-hidden className="bg-border h-px flex-1" />
        <span className="text-muted-foreground text-xs">{t('oauth.divider')}</span>
        <span aria-hidden className="bg-border h-px flex-1" />
      </div>

      <div className="space-y-3">
        {providerIds.map((providerId) => (
          <form key={providerId} action={signInWithOAuthProvider.bind(null, providerId)}>
            {/* 로그인 복귀 whitelist 키 — 서버 액션이 검증 후 해석한다 */}
            {next ? <input type="hidden" name="next" value={next} /> : null}
            <button
              type="submit"
              className="border-border hover:bg-muted w-full border px-6 py-3 text-sm font-medium transition-colors focus-visible:outline-2"
            >
              {t(BUTTON_LABEL_KEYS[providerId])}
            </button>
          </form>
        ))}
      </div>

      <p className="text-muted-foreground text-xs">{t('oauth.consentNotice')}</p>
    </div>
  );
}
