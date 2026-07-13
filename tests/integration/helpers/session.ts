import { handlers } from '@/auth';

/**
 * 고정된 next-auth 버전의 실제 route handler(GET/POST)를 Request 객체로 직접
 * 구동하는 세션 하네스 — 쿠키 왕복을 포함한 실세션 수준 검증용.
 * (AUTH_URL 미설정이면 next-auth가 Request를 변형 없이 @auth/core Auth()로
 * 넘기므로 NextRequest 없이 표준 Request로 충분하다 — 타입만 NextRequest를
 * 요구하므로 cast한다. 'next/server' 직접 import는 export map 부재로 Node에서 불가)
 */
export const BASE_URL = 'http://localhost:3000';

/** OAuth 테스트는 fake network를 주입한 별도 인스턴스를 쓴다 — 각 helper의 기본값은 프로덕션 인스턴스 */
export type AuthHandlers = typeof handlers;

type HandlerRequest = Parameters<(typeof handlers)['GET']>[0];

export function asHandlerRequest(request: Request): HandlerRequest {
  return request as unknown as HandlerRequest;
}

export class CookieJar {
  private readonly store = new Map<string, string>();

  applyFrom(response: Response): void {
    for (const line of response.headers.getSetCookie()) {
      const [pair, ...attrs] = line.split(';');
      const eq = pair.indexOf('=');
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      const attrText = attrs.join(';').toLowerCase();
      const expired =
        value === '' ||
        /max-age=0(?:;|$)/.test(attrText) ||
        (attrText.includes('expires=') && attrText.includes('1970'));
      if (expired) {
        this.store.delete(name);
      } else {
        this.store.set(name, value);
      }
    }
  }

  header(): string {
    return [...this.store.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  has(name: string): boolean {
    return this.store.has(name);
  }
}

export const SESSION_COOKIE = 'authjs.session-token';

export async function fetchCsrfToken(
  jar: CookieJar,
  auth: AuthHandlers = handlers,
): Promise<string> {
  const response = await auth.GET(
    asHandlerRequest(
      new Request(`${BASE_URL}/api/auth/csrf`, { headers: { cookie: jar.header() } }),
    ),
  );
  jar.applyFrom(response);
  const body = (await response.json()) as { csrfToken: string };
  return body.csrfToken;
}

/** Credentials 로그인 — 성공 시 jar에 session-token 쿠키가 남는다 */
export async function signInWithCredentials(
  jar: CookieJar,
  email: string,
  password: string,
  auth: AuthHandlers = handlers,
): Promise<Response> {
  const csrfToken = await fetchCsrfToken(jar, auth);
  const response = await auth.POST(
    asHandlerRequest(
      new Request(`${BASE_URL}/api/auth/callback/credentials`, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          cookie: jar.header(),
        },
        body: new URLSearchParams({ csrfToken, email, password }).toString(),
      }),
    ),
  );
  jar.applyFrom(response);
  return response;
}

/** 현재 쿠키로 session endpoint를 호출한다 — 무효화 시 세션 쿠키 제거까지 jar에 반영 */
export async function fetchSession(
  jar: CookieJar,
  auth: AuthHandlers = handlers,
): Promise<{ body: unknown; response: Response }> {
  const response = await auth.GET(
    asHandlerRequest(
      new Request(`${BASE_URL}/api/auth/session`, { headers: { cookie: jar.header() } }),
    ),
  );
  jar.applyFrom(response);
  const body: unknown = await response.json();
  return { body, response };
}

export function sessionUser(body: unknown): { email?: string; id?: string } | null {
  if (body && typeof body === 'object' && 'user' in body) {
    return (body as { user: { email?: string; id?: string } }).user ?? null;
  }
  return null;
}
