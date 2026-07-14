import type { UserRole, UserStatus } from '@/generated/prisma/client';

/**
 * Post-login redirect resolver (순수 모듈 — DB·server-only import 금지).
 *
 * 로그인 성공·이미 로그인 진입·온보딩 gate가 모두 이 함수로 목적지를 결정한다
 * (조건 복제 금지). 반환 목적지는 아래 whitelist union으로만 제한되어 임의 경로를
 * 만들 수 없다 (open redirect 방지). 향후 dashboard가 생기면 이 함수의 반환값만
 * 교체하면 진입점 코드는 불변이다.
 */
export const POST_LOGIN_DESTINATIONS = {
  ONBOARDING: '/onboarding',
  HOME: '/',
  LOGIN: '/login',
} as const;

export type PostLoginDestination =
  (typeof POST_LOGIN_DESTINATIONS)[keyof typeof POST_LOGIN_DESTINATIONS];

/** DB에서 로드해 완료 여부까지 계산한 사용자 상태. null이면 세션 없음. */
export interface PostLoginState {
  role: UserRole;
  status: UserStatus;
  deletedAt: Date | null;
  travelerOnboardingComplete: boolean;
}

/**
 * 목적지 결정:
 *  - 세션 없음 / status!=='ACTIVE' / deletedAt!=null → LOGIN (fail-closed)
 *  - TRAVELER · 미완료 → ONBOARDING
 *  - TRAVELER 완료 · EXPERT · ADMIN → HOME
 *
 * SUSPENDED/DELETED는 jwt callback이 이미 세션을 차단하므로 대개 state=null이지만,
 * DB 재조회 결과로도 fail-closed를 이중 보장한다.
 */
export function resolvePostLoginDestination(state: PostLoginState | null): PostLoginDestination {
  if (state === null || state.status !== 'ACTIVE' || state.deletedAt !== null) {
    return POST_LOGIN_DESTINATIONS.LOGIN;
  }
  if (state.role === 'TRAVELER' && !state.travelerOnboardingComplete) {
    return POST_LOGIN_DESTINATIONS.ONBOARDING;
  }
  return POST_LOGIN_DESTINATIONS.HOME;
}
