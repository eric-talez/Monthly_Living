import 'server-only';

import { env } from '@/lib/env';

import type { OAuthProviderId } from './oauth';

/**
 * env 기반 활성 OAuth provider 목록 (server-only — env 의존).
 * ID/secret이 모두 설정된 provider만 노출된다 — 부분 설정은 env 스키마가
 * 기동 시점에 이미 거부한다 (src/lib/env.ts superRefine, fail-closed).
 * UI(버튼 렌더)·서버 액션(provider id 검증)·auth.ts(provider 구성)가 공용한다.
 */
export interface EnabledOAuthProvider {
  id: OAuthProviderId;
  clientId: string;
  clientSecret: string;
}

export function getEnabledOAuthProviders(): EnabledOAuthProvider[] {
  const providers: EnabledOAuthProvider[] = [];
  if (env.AUTH_GOOGLE_ID !== undefined && env.AUTH_GOOGLE_SECRET !== undefined) {
    providers.push({
      id: 'google',
      clientId: env.AUTH_GOOGLE_ID,
      clientSecret: env.AUTH_GOOGLE_SECRET,
    });
  }
  if (env.AUTH_KAKAO_ID !== undefined && env.AUTH_KAKAO_SECRET !== undefined) {
    providers.push({
      id: 'kakao',
      clientId: env.AUTH_KAKAO_ID,
      clientSecret: env.AUTH_KAKAO_SECRET,
    });
  }
  return providers;
}

export function getEnabledOAuthProviderIds(): OAuthProviderId[] {
  return getEnabledOAuthProviders().map((provider) => provider.id);
}

export function isOAuthProviderEnabled(providerId: string): providerId is OAuthProviderId {
  return getEnabledOAuthProviders().some((provider) => provider.id === providerId);
}
