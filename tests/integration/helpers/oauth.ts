import { createHash } from 'node:crypto';

import NextAuth from 'next-auth';

import { buildAuthConfig, withOAuthRequestContext } from '@/auth';
import { prisma } from '@/lib/prisma';
import { createOAuthAdapter, type OAuthAdapterHooks } from '@/modules/auth/adapter';

import { asHandlerRequest, BASE_URL, CookieJar, type AuthHandlers } from './session';

/**
 * OAuth 통합 테스트 하네스 — 실제 next-auth handlers를 구동하되 provider의
 * 모든 외부 네트워크(discovery/token/userinfo)만 결정적 fake fetch로 대체한다
 * (buildAuthConfig({ oauthFetch }) — production과 동일한 구성 코드 경로).
 *
 * 실측 근거(@auth/core@0.41.2 + oauth4webapi@3.8.6):
 * - Google(OIDC)은 discovery → token으로만 프로필을 얻는다(id_token claims).
 *   이 flow에서 id_token **서명은 검증되지 않으므로**(JWKS fetch 없음)
 *   서명 없는 well-formed JWS로 충분하다. iss/aud/exp/iat/nonce는 정확해야 한다.
 * - Kakao(OAuth2)는 token → userinfo(Bearer)로 프로필을 얻는다. id_token 없음.
 * - PKCE(S256)는 두 provider 모두 활성 — fake token endpoint가 code_verifier를
 *   실제로 검증해 PKCE가 flow를 관통함을 증명한다.
 *
 * 가짜 access/refresh token 값은 유출 검증(테스트)이 문자열 매칭으로 찾을 수
 * 있도록 고정 prefix를 사용한다.
 */

export const FAKE_GOOGLE_ACCESS_TOKEN_PREFIX = 'fake-google-access-token-';
export const FAKE_GOOGLE_REFRESH_TOKEN_PREFIX = 'fake-google-refresh-token-';
export const FAKE_KAKAO_ACCESS_TOKEN_PREFIX = 'fake-kakao-access-token-';
export const FAKE_KAKAO_REFRESH_TOKEN_PREFIX = 'fake-kakao-refresh-token-';

const GOOGLE_ISSUER = 'https://accounts.google.com';
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const KAKAO_TOKEN_ENDPOINT = 'https://kauth.kakao.com/oauth/token';
const KAKAO_USERINFO_ENDPOINT = 'https://kapi.kakao.com/v2/user/me';

function base64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

/** 서명 없는 well-formed JWS — 이 고정 스택은 id_token 서명을 검증하지 않는다 (위 주석) */
export function unsignedIdToken(claims: Record<string, unknown>): string {
  const header = base64UrlJson({ alg: 'RS256', typ: 'JWT' });
  const payload = base64UrlJson(claims);
  const signature = Buffer.from('test-signature-not-verified').toString('base64url');
  return `${header}.${payload}.${signature}`;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function s256(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

interface RegisteredGoogleFlow {
  /** id_token에 실릴 claims — iss/aud/exp/iat는 mint 시점에 채워진다 */
  claims: Record<string, unknown>;
  expectedCodeChallenge: string | null;
  nonce: string | null;
}

interface RegisteredKakaoFlow {
  /** userinfo 응답 JSON */
  profile: Record<string, unknown>;
  expectedCodeChallenge: string | null;
}

let flowSequence = 0;

/** flow마다 고유한 authorization code — 동시 flow(race 테스트)를 code로 구분한다 */
export function nextAuthorizationCode(label: string): string {
  flowSequence += 1;
  return `fake-code-${label}-${flowSequence}`;
}

export class FakeOAuthNetwork {
  private readonly googleFlows = new Map<string, RegisteredGoogleFlow>();
  private readonly kakaoFlows = new Map<string, RegisteredKakaoFlow>();
  /** access_token → userinfo 프로필 (userinfo 요청에는 code가 없다) */
  private readonly kakaoProfilesByAccessToken = new Map<string, Record<string, unknown>>();

  registerGoogleFlow(code: string, flow: RegisteredGoogleFlow): void {
    this.googleFlows.set(code, flow);
  }

  registerKakaoFlow(code: string, flow: RegisteredKakaoFlow): void {
    this.kakaoFlows.set(code, flow);
  }

  /** provider options의 [customFetch]로 주입된다 */
  readonly fetch: typeof fetch = async (input, init) => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
    );
    const method = (
      init?.method ?? (input instanceof Request ? input.method : 'GET')
    ).toUpperCase();

    if (url.href === `${GOOGLE_ISSUER}/.well-known/openid-configuration`) {
      return jsonResponse({
        issuer: GOOGLE_ISSUER,
        authorization_endpoint: `${GOOGLE_ISSUER}/o/oauth2/v2/auth`,
        token_endpoint: GOOGLE_TOKEN_ENDPOINT,
        userinfo_endpoint: 'https://openidconnect.googleapis.com/v1/userinfo',
        code_challenge_methods_supported: ['S256'],
        id_token_signing_alg_values_supported: ['RS256'],
      });
    }

    if (url.href === GOOGLE_TOKEN_ENDPOINT && method === 'POST') {
      const body = new URLSearchParams((await readBody(input, init)) ?? '');
      const code = body.get('code') ?? '';
      const flow = this.googleFlows.get(code);
      if (!flow) {
        return jsonResponse({ error: 'invalid_grant' }, 400);
      }
      const pkceError = verifyPkce(body, flow.expectedCodeChallenge);
      if (pkceError) {
        return pkceError;
      }
      const now = Math.floor(Date.now() / 1000);
      const claims: Record<string, unknown> = {
        iss: GOOGLE_ISSUER,
        aud: process.env.AUTH_GOOGLE_ID,
        iat: now - 30,
        exp: now + 600,
        ...(flow.nonce === null ? {} : { nonce: flow.nonce }),
        ...flow.claims,
      };
      return jsonResponse({
        access_token: `${FAKE_GOOGLE_ACCESS_TOKEN_PREFIX}${code}`,
        refresh_token: `${FAKE_GOOGLE_REFRESH_TOKEN_PREFIX}${code}`,
        token_type: 'bearer',
        expires_in: 3600,
        scope: 'openid https://www.googleapis.com/auth/userinfo.email',
        id_token: unsignedIdToken(claims),
      });
    }

    if (url.href === KAKAO_TOKEN_ENDPOINT && method === 'POST') {
      const body = new URLSearchParams((await readBody(input, init)) ?? '');
      const code = body.get('code') ?? '';
      const flow = this.kakaoFlows.get(code);
      if (!flow) {
        return jsonResponse({ error: 'invalid_grant' }, 400);
      }
      const pkceError = verifyPkce(body, flow.expectedCodeChallenge);
      if (pkceError) {
        return pkceError;
      }
      const accessToken = `${FAKE_KAKAO_ACCESS_TOKEN_PREFIX}${code}`;
      this.kakaoProfilesByAccessToken.set(accessToken, flow.profile);
      return jsonResponse({
        access_token: accessToken,
        refresh_token: `${FAKE_KAKAO_REFRESH_TOKEN_PREFIX}${code}`,
        // Kakao 실서버가 보내는 비표준 필드 — defaultAccount 필터·미저장 검증용
        refresh_token_expires_in: 5183999,
        token_type: 'bearer',
        expires_in: 21599,
        scope: 'account_email profile_nickname',
      });
    }

    if (url.href === KAKAO_USERINFO_ENDPOINT) {
      const authorization =
        (init?.headers ? new Headers(init.headers).get('authorization') : null) ??
        (input instanceof Request ? input.headers.get('authorization') : null) ??
        '';
      const accessToken = authorization.replace(/^Bearer\s+/i, '');
      const profile = this.kakaoProfilesByAccessToken.get(accessToken);
      if (!profile) {
        return jsonResponse({ msg: 'invalid token', code: -401 }, 401);
      }
      return jsonResponse(profile);
    }

    throw new Error(`[oauth-test] unexpected external request: ${method} ${url.href}`);
  };
}

async function readBody(
  input: Parameters<typeof fetch>[0],
  init?: RequestInit,
): Promise<string | null> {
  if (init?.body !== undefined && init.body !== null) {
    if (typeof init.body === 'string') {
      return init.body;
    }
    if (init.body instanceof URLSearchParams) {
      return init.body.toString();
    }
  }
  if (input instanceof Request) {
    return input.clone().text();
  }
  return null;
}

/** PKCE S256 검증 — code_verifier가 실제 token 요청까지 도달하는지 증명한다 */
function verifyPkce(body: URLSearchParams, expectedChallenge: string | null): Response | null {
  if (expectedChallenge === null) {
    return null;
  }
  const verifier = body.get('code_verifier');
  if (!verifier || s256(verifier) !== expectedChallenge) {
    return jsonResponse({ error: 'invalid_grant', error_description: 'pkce' }, 400);
  }
  return null;
}

// ── 테스트 앱 팩토리 ─────────────────────────────────────────────

export interface OAuthTestApp {
  auth: AuthHandlers;
  network: FakeOAuthNetwork;
}

/**
 * fake network를 주입한 실제 NextAuth 인스턴스 — adapter도 production과 같은
 * 팩토리(createOAuthAdapter)를 사용한다. hooks는 실패 주입 테스트 전용.
 */
export function createOAuthTestApp(hooks?: OAuthAdapterHooks): OAuthTestApp {
  const network = new FakeOAuthNetwork();
  const config = buildAuthConfig({
    oauthFetch: network.fetch,
    adapter: createOAuthAdapter(prisma, hooks),
  });
  const instance = NextAuth(config);
  return { auth: withOAuthRequestContext(instance.handlers), network };
}

// ── flow driver ─────────────────────────────────────────────────

export type OAuthTestProviderId = 'google' | 'kakao';

/**
 * POST /api/auth/signin/{provider} — authorization redirect URL을 돌려준다.
 * callbackUrl은 OAuth 버튼 서버 액션의 redirectTo에 해당한다 (locale 전파 근거).
 */
export async function startOAuthSignIn(
  app: OAuthTestApp,
  jar: CookieJar,
  providerId: OAuthTestProviderId,
  options: { callbackUrl?: string } = {},
): Promise<URL> {
  const csrfToken = await fetchCsrfTokenWith(app.auth, jar);
  const form = new URLSearchParams({ csrfToken });
  if (options.callbackUrl !== undefined) {
    form.set('callbackUrl', options.callbackUrl);
  }
  const response = await app.auth.POST(
    asHandlerRequest(
      new Request(`${BASE_URL}/api/auth/signin/${providerId}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          cookie: jar.header(),
        },
        body: form.toString(),
      }),
    ),
  );
  jar.applyFrom(response);
  const location = response.headers.get('location');
  if (response.status !== 302 || !location) {
    throw new Error(`[oauth-test] signin redirect 실패: status=${response.status}`);
  }
  return new URL(location);
}

async function fetchCsrfTokenWith(auth: AuthHandlers, jar: CookieJar): Promise<string> {
  const response = await auth.GET(
    asHandlerRequest(
      new Request(`${BASE_URL}/api/auth/csrf`, { headers: { cookie: jar.header() } }),
    ),
  );
  jar.applyFrom(response);
  const body = (await response.json()) as { csrfToken: string };
  return body.csrfToken;
}

/** GET /api/auth/callback/{provider}?code&state — provider가 되돌려보낸 요청을 재현 */
export async function completeOAuthCallback(
  app: OAuthTestApp,
  jar: CookieJar,
  providerId: OAuthTestProviderId,
  code: string,
  authorizationUrl: URL,
): Promise<Response> {
  const params = new URLSearchParams({ code });
  const state = authorizationUrl.searchParams.get('state');
  if (state !== null) {
    params.set('state', state);
  }
  const response = await app.auth.GET(
    asHandlerRequest(
      new Request(`${BASE_URL}/api/auth/callback/${providerId}?${params.toString()}`, {
        headers: { cookie: jar.header() },
      }),
    ),
  );
  jar.applyFrom(response);
  return response;
}

export interface FakeGoogleProfile {
  sub?: unknown;
  email?: unknown;
  email_verified?: unknown;
  name?: string;
  picture?: string;
}

export interface FakeKakaoProfile {
  id?: unknown;
  email?: unknown;
  is_email_valid?: unknown;
  is_email_verified?: unknown;
  nickname?: string;
  profileImageUrl?: string;
}

/** Google 로그인 왕복 — signin → (fake) 동의 → callback. 응답을 그대로 돌려준다. */
export async function performGoogleLogin(
  app: OAuthTestApp,
  jar: CookieJar,
  profile: FakeGoogleProfile,
  options: { callbackUrl?: string; code?: string } = {},
): Promise<Response> {
  const authorizationUrl = await startOAuthSignIn(app, jar, 'google', options);
  const code = options.code ?? nextAuthorizationCode('google');
  const claims: Record<string, unknown> = {};
  if (profile.sub !== undefined) claims.sub = profile.sub;
  if (profile.email !== undefined) claims.email = profile.email;
  if (profile.email_verified !== undefined) claims.email_verified = profile.email_verified;
  if (profile.name !== undefined) claims.name = profile.name;
  if (profile.picture !== undefined) claims.picture = profile.picture;
  app.network.registerGoogleFlow(code, {
    claims,
    expectedCodeChallenge: authorizationUrl.searchParams.get('code_challenge'),
    nonce: authorizationUrl.searchParams.get('nonce'),
  });
  return completeOAuthCallback(app, jar, 'google', code, authorizationUrl);
}

/** Kakao 로그인 왕복 */
export async function performKakaoLogin(
  app: OAuthTestApp,
  jar: CookieJar,
  profile: FakeKakaoProfile,
  options: { callbackUrl?: string; code?: string } = {},
): Promise<Response> {
  const authorizationUrl = await startOAuthSignIn(app, jar, 'kakao', options);
  const code = options.code ?? nextAuthorizationCode('kakao');
  const kakaoAccount: Record<string, unknown> = {
    profile: {
      ...(profile.nickname !== undefined ? { nickname: profile.nickname } : {}),
      ...(profile.profileImageUrl !== undefined
        ? { profile_image_url: profile.profileImageUrl }
        : {}),
    },
  };
  if (profile.email !== undefined) kakaoAccount.email = profile.email;
  if (profile.is_email_valid !== undefined) kakaoAccount.is_email_valid = profile.is_email_valid;
  if (profile.is_email_verified !== undefined) {
    kakaoAccount.is_email_verified = profile.is_email_verified;
  }
  const userinfo: Record<string, unknown> = { kakao_account: kakaoAccount };
  if (profile.id !== undefined) userinfo.id = profile.id;
  app.network.registerKakaoFlow(code, {
    profile: userinfo,
    expectedCodeChallenge: authorizationUrl.searchParams.get('code_challenge'),
  });
  return completeOAuthCallback(app, jar, 'kakao', code, authorizationUrl);
}

/** 성공: 302 → callbackUrl (기본 홈) */
export function expectSuccessRedirect(response: Response): void {
  const location = response.headers.get('location') ?? '';
  if (response.status !== 302 || location.includes('error=')) {
    throw new Error(`[oauth-test] 성공 redirect가 아님: ${response.status} ${location}`);
  }
}

/** 실패: 302 → /login?error=... (내부 사유는 쿼리 enum으로만 — 페이지는 일반화 메시지) */
export function expectErrorRedirect(response: Response): string {
  const location = response.headers.get('location') ?? '';
  if (response.status !== 302 || !location.includes('/login?')) {
    throw new Error(`[oauth-test] 오류 redirect가 아님: ${response.status} ${location}`);
  }
  const url = new URL(location);
  const error = url.searchParams.get('error');
  if (!error) {
    throw new Error(`[oauth-test] error 쿼리가 없음: ${location}`);
  }
  return error;
}
