import 'server-only';

import { PrismaAdapter } from '@auth/prisma-adapter';
import type { Adapter } from 'next-auth/adapters';

import type { PrismaClient } from '@/generated/prisma/client';

/**
 * OAuth 전용 adapter — @auth/prisma-adapter 기반, **mutation은 전부 fail-closed**.
 *
 * 신규 identity(User+ConsentRecord+Account)는 signIn callback의
 * `ensureOAuthIdentity()`(modules/auth/oauth-identity.ts) 단일 transaction에서만
 * 생성된다. signIn callback이 통과한 flow는 core의 handleLoginOrRegister가
 * Account를 재조회해 기존 사용자 로그인 경로를 타므로(@auth/core
 * handle-login.js:175-199 실측), 정상 OAuth flow에서 adapter의
 * createUser/linkAccount는 절대 호출되지 않는다. 여기의 throw는 그 전제가
 * 깨졌을 때(설정 회귀, 미구성 provider 유형 추가, core 동작 변화) 부분 상태를
 * 만들지 않고 즉시 실패시키는 안전장치이자, 통합 테스트에서 "성공한 flow는
 * 사전 생성 경로만 지났다"는 lifecycle 증명이다.
 *
 * deleteUser/unlinkAccount도 차단한다 — 계정 탈퇴는 별도 soft delete 서비스가
 * 담당하며(결정 문서) adapter 경유 hard delete 경로를 남기지 않는다.
 *
 * 오류 메시지는 비민감 slug만 사용한다 (이메일·토큰·프로필 값 금지).
 */

export class OAuthAdapterMutationBlockedError extends Error {
  constructor(method: string) {
    super(
      `[auth][oauth] adapter.${method} is fail-closed: identities are created only by ensureOAuthIdentity()`,
    );
    this.name = 'OAuthAdapterMutationBlockedError';
  }
}

export function createOAuthAdapter(db: PrismaClient): Adapter {
  const base = PrismaAdapter(db);

  return {
    ...base,
    createUser: async () => {
      throw new OAuthAdapterMutationBlockedError('createUser');
    },
    linkAccount: async () => {
      throw new OAuthAdapterMutationBlockedError('linkAccount');
    },
    deleteUser: async () => {
      throw new OAuthAdapterMutationBlockedError('deleteUser');
    },
    unlinkAccount: async () => {
      throw new OAuthAdapterMutationBlockedError('unlinkAccount');
    },
  };
}
