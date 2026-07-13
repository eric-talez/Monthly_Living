import 'server-only';

import { Prisma } from '@/generated/prisma/client';
import type { AppLocale } from '@/i18n/routing';

import { CONSENT_TERMS_VERSION } from './constants';
import type { AuthServiceDeps } from './deps';
import type { OAuthProviderId } from './oauth';

/**
 * OAuth identity 원자적 사전 생성 — signIn callback이 프로필 검증
 * (modules/auth/oauth.ts) 통과 후 이 함수만 호출한다.
 *
 * 핵심 설계 (docs/decisions/oauth-account-linking.md):
 * Auth.js core의 createUser → linkAccount는 별도 호출이라 원자성이 없다
 * (@auth/core handle-login.js:260→264). 그래서 신규 identity의
 * User + ConsentRecord(3행) + Account를 **여기의 단일 Prisma transaction**에서
 * 전부 생성하거나 전부 rollback한다 — createUser commit 직후 프로세스가 죽어도
 * Account 없는 고아 User가 unique email을 점유하는 창이 존재하지 않는다.
 *
 * signIn callback이 true를 반환하면 core의 handleLoginOrRegister가 Account를
 * **새로 재조회**(handle-login.js:175-178)해 방금 만든 Account를 찾고, 기존
 * 사용자 로그인 경로(:179-199, isNewUser=false → trigger='signIn')를 탄다 —
 * adapter.createUser/linkAccount는 정상 flow에서 절대 호출되지 않는다
 * (modules/auth/adapter.ts가 fail-closed로 증명).
 */

export type OAuthIdentityDenyReason =
  /** Account 소유 user가 SUSPENDED/DELETED/soft-deleted */
  | 'account-owner-not-active'
  /** 미등록 identity + 요청에 Auth.js 세션 쿠키 존재 — 세션 편승 연결 차단 (fail-closed) */
  | 'active-session-present'
  /** 동일 정규화 이메일 user가 이미 존재(상태 무관) — 자동 연결 금지 */
  | 'email-already-registered'
  /** unique 충돌 rollback 후 재조회로도 분류 불가한 동시성 잔여 사례 */
  | 'conflict';

export type OAuthIdentityResult =
  | { ok: true; kind: 'existing' | 'created'; userId: string }
  | { ok: false; reason: OAuthIdentityDenyReason };

export interface OAuthIdentityInput {
  providerId: OAuthProviderId;
  /** Account.type — Auth.js provider 유형 ('oidc' | 'oauth') */
  providerAccountType: string;
  providerAccountId: string;
  /** emailSchema 정규화 통과 값 (validateOAuthProfile) */
  email: string;
  name?: string;
  image?: string;
  /** flow를 시작한 locale (callback-url 쿠키에서 복원 — oauth-request-context.ts) */
  locale: AppLocale;
  /** 요청에 세션 쿠키가 존재하는지 — 컨텍스트가 없으면 호출자는 true(fail-closed)를 넣는다 */
  hasAuthSessionCookie: boolean;
}

/** 테스트 전용 실패 주입 지점 — transaction 내부에서 실행되어 throw 시 전체 rollback */
export interface OAuthIdentityHooks {
  beforeUserCreate?: () => void | Promise<void>;
  afterUserCreate?: () => void | Promise<void>;
  afterConsentCreate?: () => void | Promise<void>;
  /** Account 생성 후 commit 직전 */
  afterAccountCreate?: () => void | Promise<void>;
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

export async function ensureOAuthIdentity(
  input: OAuthIdentityInput,
  deps: Pick<AuthServiceDeps, 'db'>,
  hooks?: OAuthIdentityHooks,
): Promise<OAuthIdentityResult> {
  const accountKey = {
    provider_providerAccountId: {
      provider: input.providerId,
      providerAccountId: input.providerAccountId,
    },
  };

  try {
    return await deps.db.$transaction(async (tx) => {
      // 1) 재로그인: Account가 이미 있으면 소유자 상태만 확인하고 그대로 사용한다.
      //    provider 쪽 이메일이 바뀌었어도 User email·소유권은 절대 변경하지 않는다.
      const account = await tx.account.findUnique({
        where: accountKey,
        select: { userId: true, user: { select: { status: true, deletedAt: true } } },
      });
      if (account) {
        if (account.user.status !== 'ACTIVE' || account.user.deletedAt !== null) {
          return { ok: false, reason: 'account-owner-not-active' } as const;
        }
        return { ok: true, kind: 'existing', userId: account.userId } as const;
      }

      // 2) 미등록 identity + 세션 쿠키 존재 → fail-closed 거부 (세션 편승 연결 차단).
      //    쿠키 유효성은 보지 않는다 — 만료된 쿠키로도 신규 가입이 막히는 것은
      //    문서화된 fail-safe UX 한계다 (로그아웃으로 해소).
      if (input.hasAuthSessionCookie) {
        return { ok: false, reason: 'active-session-present' } as const;
      }

      // 3) 동일 정규화 이메일 user가 상태와 무관하게 존재하면 자동 연결하지 않는다.
      const existingByEmail = await tx.user.findUnique({
        where: { email: input.email },
        select: { id: true },
      });
      if (existingByEmail) {
        return { ok: false, reason: 'email-already-registered' } as const;
      }

      // 4) 신규 identity — User·동의·Account를 같은 transaction에서 전부 생성한다.
      //    이메일은 provider가 검증했음을 validateOAuthProfile이 보장하므로
      //    emailVerified를 생성 시점에 설정한다. role/status는 스키마 기본값
      //    (TRAVELER/ACTIVE). 동의 3행의 근거 고지는 OAuth 버튼 UI에 상시 표시.
      await hooks?.beforeUserCreate?.();
      const user = await tx.user.create({
        data: {
          email: input.email,
          name: input.name ?? null,
          image: input.image ?? null,
          emailVerified: new Date(),
          preferredLanguage: input.locale,
        },
        select: { id: true },
      });
      await hooks?.afterUserCreate?.();

      await tx.consentRecord.createMany({
        data: [
          { userId: user.id, type: 'TERMS', version: CONSENT_TERMS_VERSION, granted: true },
          { userId: user.id, type: 'PRIVACY', version: CONSENT_TERMS_VERSION, granted: true },
          { userId: user.id, type: 'MARKETING', version: CONSENT_TERMS_VERSION, granted: false },
        ],
      });
      await hooks?.afterConsentCreate?.();

      // provider token(access/refresh/id_token 등)은 저장하지 않는다 — 4필드만.
      await tx.account.create({
        data: {
          userId: user.id,
          type: input.providerAccountType,
          provider: input.providerId,
          providerAccountId: input.providerAccountId,
        },
      });
      await hooks?.afterAccountCreate?.();

      return { ok: true, kind: 'created', userId: user.id } as const;
    });
  } catch (error) {
    if (!isUniqueViolation(error)) {
      throw error;
    }
    // unique 충돌 — transaction 전체가 이미 rollback됐다 (부분 상태 없음, hard delete 불필요).
    // 동시 요청이 먼저 성공한 것이므로 재조회로 분류한다.
    return classifyAfterUniqueConflict(input, deps);
  }
}

/**
 * P2002 rollback 후 재조회 분류:
 * - 동일 (provider, providerAccountId) Account가 생겼으면 → 같은 identity의 동시
 *   로그인이 먼저 이긴 것 — 활성 소유자 확인 후 기존 identity로 처리(로그인 허용).
 * - 동일 이메일 user만 생겼으면 → 다른 provider 가입이 먼저 성공 — 일반화 오류.
 * - 그 외 → 일반화 오류.
 */
async function classifyAfterUniqueConflict(
  input: OAuthIdentityInput,
  deps: Pick<AuthServiceDeps, 'db'>,
): Promise<OAuthIdentityResult> {
  const account = await deps.db.account.findUnique({
    where: {
      provider_providerAccountId: {
        provider: input.providerId,
        providerAccountId: input.providerAccountId,
      },
    },
    select: { userId: true, user: { select: { status: true, deletedAt: true } } },
  });
  if (account) {
    if (account.user.status !== 'ACTIVE' || account.user.deletedAt !== null) {
      return { ok: false, reason: 'account-owner-not-active' };
    }
    return { ok: true, kind: 'existing', userId: account.userId };
  }

  const existingByEmail = await deps.db.user.findUnique({
    where: { email: input.email },
    select: { id: true },
  });
  if (existingByEmail) {
    return { ok: false, reason: 'email-already-registered' };
  }

  return { ok: false, reason: 'conflict' };
}
