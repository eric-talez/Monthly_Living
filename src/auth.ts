import NextAuth, { CredentialsSignin, customFetch, type NextAuthConfig } from 'next-auth';
import type { Adapter } from 'next-auth/adapters';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import Kakao from 'next-auth/providers/kakao';

import { ERROR_CODES, isAppError } from '@/lib/errors';
import { prisma } from '@/lib/prisma';
import { getClientIp } from '@/lib/request-ip';
import { createOAuthAdapter } from '@/modules/auth/adapter';
import { evaluateOAuthSignIn, mapGoogleProfile, mapKakaoProfile } from '@/modules/auth/oauth';
import { getEnabledOAuthProviders } from '@/modules/auth/oauth-providers';
import {
  localeFromRequestCookies,
  runWithOAuthRequestContext,
} from '@/modules/auth/oauth-request-context';
import { authorizeLogin, getSessionClaims } from '@/modules/auth/service';

/**
 * Auth.js v5 구성 — JWT 세션 전략 (docs/decisions/authjs-session-strategy.md).
 *
 * - adapter가 있으면 세션 전략 기본값이 'database'가 되므로(@auth/core lib/init.js 실측)
 *   `strategy: 'jwt'`를 반드시 명시한다 — 이 스키마에는 Session 모델이 없다.
 * - adapter는 OAuth(Account 연결) 전용 custom adapter다 — createUser/linkAccount의
 *   원자성·연결 불변식은 modules/auth/adapter.ts가 강제한다. Credentials 흐름은
 *   adapter를 사용하지 않으며, adapter의 deleteUser()는 어떤 경로에서도 호출하지
 *   않는다 (계정 탈퇴는 별도 soft delete 서비스 — 결정 문서).
 * - 로그인 검증·rate limit·LoginAttempt 기록은 전부 authorize() → 서비스 단일
 *   지점에서 강제된다. server action을 거치지 않는 직접 POST
 *   (/api/auth/callback/credentials)도 같은 경로를 지난다.
 * - OAuth 로그인 정책(provider 검증 이메일·계정 상태·providerAccountId 일치)은
 *   signIn callback → modules/auth/oauth.ts 단일 지점에서 강제된다
 *   (docs/decisions/oauth-account-linking.md).
 * - `debug`는 어떤 환경에서도 활성화하지 않는다 — @auth/core는 debug 수준에서
 *   token이 포함된 인자(adapter_linkAccount args 등)를 출력한다 (init.js 실측).
 */

/** limiter 차단을 일반 로그인 실패와 구분하기 위한 오류 — code는 URL 쿼리에 노출될 수 있으므로 비민감 값만 */
export class RateLimitedLoginError extends CredentialsSignin {
  code = 'rate_limited';
}

export interface BuildAuthConfigOverrides {
  /**
   * 테스트 전용 — OAuth provider의 모든 외부 네트워크(discovery/token/userinfo)를
   * 대체하는 fetch. 실제 Google/Kakao 서버 없이 결정적 통합 테스트를 구동한다
   * (modules/auth/deps.ts와 같은 주입 철학). production은 전달하지 않는다.
   */
  oauthFetch?: typeof fetch;
  /** 테스트 전용 — 실패 주입 hook을 단 custom adapter 주입 (동일 팩토리 사용) */
  adapter?: Adapter;
}

export function buildAuthConfig(overrides: BuildAuthConfigOverrides = {}): NextAuthConfig {
  const oauthFetchOption =
    overrides.oauthFetch === undefined ? {} : { [customFetch]: overrides.oauthFetch };

  const providers: NextAuthConfig['providers'] = [
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
  ];

  for (const provider of getEnabledOAuthProviders()) {
    if (provider.id === 'google') {
      providers.push(
        Google({
          clientId: provider.clientId,
          clientSecret: provider.clientSecret,
          // 기본 checks는 ['pkce']뿐이라 state 검증이 생략된다(@auth/core
          // lib/utils/providers.js:52 실측) — OIDC는 nonce까지 명시한다.
          checks: ['pkce', 'state', 'nonce'],
          profile: (profile) => mapGoogleProfile(profile),
          // provider token(access/refresh/id_token 등)은 이번 Phase에서 저장하지
          // 않는다 — Account에는 identity 연결 필드만 남긴다 (결정 문서).
          account: () => ({}),
          ...oauthFetchOption,
        }),
      );
    } else {
      providers.push(
        Kakao({
          clientId: provider.clientId,
          clientSecret: provider.clientSecret,
          // Kakao는 OAuth2(id_token 없음)라 nonce를 지정하면 안 된다 —
          // nonce 지정 시 oauth4webapi가 id_token을 요구해 flow가 깨진다 (실측).
          checks: ['pkce', 'state'],
          profile: (profile) => mapKakaoProfile(profile),
          account: () => ({}),
          ...oauthFetchOption,
        }),
      );
    }
  }

  return {
    adapter: overrides.adapter ?? createOAuthAdapter(prisma),
    session: { strategy: 'jwt' },
    // AccessDenied(signIn callback 거부)·CallbackRouteError는 kind가 'error'라
    // pages.error가 없으면 @auth/core 기본 영문 페이지로 빠진다 (실측) —
    // /login은 어떤 ?error= 값이든 일반화 메시지 하나로만 표시한다.
    pages: { signIn: '/login', error: '/login' },
    providers,
    callbacks: {
      /**
       * OAuth 로그인 정책의 단일 강제 지점 — @auth/core는 이 callback을
       * handleLoginOrRegister(사용자 생성·Account 연결) 이전에 실행한다
       * (lib/actions/callback/index.js:63→70 실측). false 반환은 AccessDenied로
       * 변환되어 /login의 일반화 메시지로만 노출된다.
       */
      signIn: async ({ account, profile }) => {
        if (!account || account.type === 'credentials') {
          // Credentials는 authorize() → 서비스가 이미 전부 검증했다 (기존 경로 불변)
          return true;
        }
        if (account.type !== 'oauth' && account.type !== 'oidc') {
          // email/webauthn 등 구성하지 않은 provider 유형은 fail-closed
          return false;
        }
        const decision = await evaluateOAuthSignIn(
          {
            providerId: account.provider,
            profile,
            providerAccountId: account.providerAccountId,
          },
          { db: prisma },
        );
        return decision.allowed;
      },
      /**
       * JWT 전략에서는 세션을 읽을 때마다 이 callback이 실행된다.
       * 매 호출 DB에서 사용자 상태를 재확인해(PK 조회 1회 — MVP 트레이드오프,
       * 요청당 dedupe는 lib/session.ts의 cache 담당) 다음을 강제한다:
       * - SUSPENDED/DELETED/deletedAt 사용자: null 반환 → 세션 쿠키 제거 (기존 세션 차단)
       * - credentialVersion(passwordHash HMAC digest) 불일치: 비밀번호 재설정 이전에
       *   발급된 세션 무효화. raw passwordHash는 토큰에 싣지 않는다.
       * OAuth 로그인 사용자는 credentialVersion이 null이므로 digest 검사를 건너뛴다
       * (OAuth 세션은 provider identity 기반 — 비밀번호 재설정과 독립, 결정 문서).
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
}

type NextAuthHandlers = ReturnType<typeof NextAuth>['handlers'];

/**
 * route handler 래퍼 — 요청마다 OAuth 요청 컨텍스트(AsyncLocalStorage)를 연다.
 * adapter(createUser/linkAccount)는 요청 객체를 받지 못하므로, 신규 가입
 * locale(callback-url 쿠키에서 복원)과 provisional user 추적(보상 정리 provenance)을
 * 이 컨텍스트로 전달한다. production과 통합 테스트가 같은 래퍼를 사용한다.
 */
export function withOAuthRequestContext(handlers: NextAuthHandlers): NextAuthHandlers {
  const wrap = (handler: NextAuthHandlers['GET']): NextAuthHandlers['GET'] => {
    return (request) =>
      runWithOAuthRequestContext({ locale: localeFromRequestCookies(request) }, () =>
        handler(request),
      );
  };
  return { GET: wrap(handlers.GET), POST: wrap(handlers.POST) };
}

const nextAuth = NextAuth(buildAuthConfig());

export const handlers = withOAuthRequestContext(nextAuth.handlers);
export const { auth, signIn, signOut } = nextAuth;
