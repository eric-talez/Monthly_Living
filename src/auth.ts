import { PrismaAdapter } from '@auth/prisma-adapter';
import NextAuth, { CredentialsSignin, type NextAuthConfig } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';

import { ERROR_CODES, isAppError } from '@/lib/errors';
import { prisma } from '@/lib/prisma';
import { getClientIp } from '@/lib/request-ip';
import { authorizeLogin, getSessionClaims } from '@/modules/auth/service';

/**
 * Auth.js v5 구성 — JWT 세션 전략 (docs/decisions/authjs-session-strategy.md).
 *
 * - adapter가 있으면 세션 전략 기본값이 'database'가 되므로(@auth/core lib/init.js 실측)
 *   `strategy: 'jwt'`를 반드시 명시한다 — 이 스키마에는 Session 모델이 없다.
 * - adapter는 Phase 1C-2 OAuth(Account 연결)를 위해 지금 연결해 둔다.
 *   Credentials 흐름 자체는 adapter를 사용하지 않으며, adapter의 deleteUser()는
 *   어떤 경로에서도 호출하지 않는다 (계정 탈퇴는 별도 soft delete 서비스 — 결정 문서).
 * - 로그인 검증·rate limit·LoginAttempt 기록은 전부 authorize() → 서비스 단일
 *   지점에서 강제된다. server action을 거치지 않는 직접 POST
 *   (/api/auth/callback/credentials)도 같은 경로를 지난다.
 */

/** limiter 차단을 일반 로그인 실패와 구분하기 위한 오류 — code는 URL 쿼리에 노출될 수 있으므로 비민감 값만 */
export class RateLimitedLoginError extends CredentialsSignin {
  code = 'rate_limited';
}

export const authConfig = {
  adapter: PrismaAdapter(prisma),
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  providers: [
    Credentials({
      credentials: {
        email: { label: 'email' },
        password: { label: 'password', type: 'password' },
      },
      // 스키마 검증 포함 검증 본체는 service.authorizeLogin — 여기는 IP 추출과
      // RATE_LIMITED → CredentialsSignin 변환만 담당하는 얇은 어댑터로 유지한다
      authorize: async (credentials, request) => {
        try {
          return await authorizeLogin(credentials, {
            ipAddress: getClientIp(request.headers),
          });
        } catch (error) {
          if (isAppError(error) && error.code === ERROR_CODES.RATE_LIMITED) {
            throw new RateLimitedLoginError();
          }
          throw error;
        }
      },
    }),
  ],
  callbacks: {
    /**
     * JWT 전략에서는 세션을 읽을 때마다 이 callback이 실행된다.
     * 매 호출 DB에서 사용자 상태를 재확인해(PK 조회 1회 — MVP 트레이드오프,
     * 요청당 dedupe는 lib/session.ts의 cache 담당) 다음을 강제한다:
     * - SUSPENDED/DELETED/deletedAt 사용자: null 반환 → 세션 쿠키 제거 (기존 세션 차단)
     * - credentialVersion(passwordHash HMAC digest) 불일치: 비밀번호 재설정 이전에
     *   발급된 세션 무효화. raw passwordHash는 토큰에 싣지 않는다.
     * 향후 최적화 여지: 재확인 간격 클레임 도입(현재는 정확성 우선).
     */
    jwt: async ({ token, user }) => {
      if (user) {
        token.userId = user.id;
        token.credentialVersion = user.credentialVersion ?? null;
      }
      if (typeof token.userId !== 'string' || token.userId.length === 0) {
        return null;
      }

      const claims = await getSessionClaims(token.userId);
      if (!claims || claims.status !== 'ACTIVE' || claims.deletedAt !== null) {
        return null;
      }
      if (
        typeof token.credentialVersion === 'string' &&
        token.credentialVersion !== claims.credentialDigest
      ) {
        return null;
      }

      token.role = claims.role;
      token.status = claims.status;
      return token;
    },
    session: ({ session, token }) => {
      if (typeof token.userId === 'string') {
        session.user.id = token.userId;
      }
      if (token.role) {
        session.user.role = token.role;
      }
      if (token.status) {
        session.user.status = token.status;
      }
      // credentialVersion은 서버 내부 검증용 — session(클라이언트 노출)에는 복사하지 않는다
      return session;
    },
  },
} satisfies NextAuthConfig;

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
