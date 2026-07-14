import 'server-only';

import { ACCOUNT_DELETION_TOKEN_TTL_MS } from '@/modules/auth/constants';
import { getDefaultAuthDeps, type AuthServiceDeps } from '@/modules/auth/deps';
import { buildAccountDeletionEmail } from '@/modules/auth/emails';
import {
  enforceLimit,
  limiterKey,
  replaceToken,
  sendAuthEmail,
  type RequestContext,
} from '@/modules/auth/service';
import { hashToken, isWellFormedAuthToken } from '@/modules/auth/tokens';
import { ERROR_CODES, isAppError } from '@/lib/errors';

import {
  clearDeletionTokenCookies,
  readDeletionTokenCookie,
  type DeletionCookieClearSpec,
  type DeletionCookieReadStore,
} from './deletion-token-cookie';
import { classifyDeletionEligibility, loadDeletionObligations } from './eligibility';

/**
 * 여행자(TRAVELER) self-service 계정 탈퇴 — 구조화 계정 PII 익명화
 * (structured account PII anonymization) + User identity tombstoning.
 *
 * 범위: User row의 구조화 개인정보 필드와 인증 identity(Account·토큰)만 제거한다.
 * 메시지·리뷰·티켓 등 자유 입력 본문은 거래·감사 기록으로 보존되며, 그 개인정보
 * 정책은 Phase 8 후속이다 — 전체 개인정보의 완전한 익명화를 뜻하지 않는다.
 * 정책·matrix: docs/decisions/account-deletion-and-anonymization.md
 *
 * 로그 규칙: 토큰 원문·전체 이메일·userId는 어떤 로그에도 남기지 않는다.
 */

export type RequestAccountDeletionResult = 'sent' | 'blocked' | 'unsupported';
export type AccountDeletionPreflight = 'ok' | 'invalid' | 'expired' | 'blocked';
export type ConfirmAccountDeletionResult = 'deleted' | 'invalid' | 'expired' | 'blocked';

/**
 * 테스트 전용 실패 주입 지점 — transaction 내부에서 await되어 throw 시
 * 전체 rollback된다 (oauth-identity.ts OAuthIdentityHooks 미러).
 */
export interface AccountDeletionHooks {
  afterTokenConsume?: () => void | Promise<void>;
  afterAccountDelete?: () => void | Promise<void>;
  beforeUserAnonymize?: () => void | Promise<void>;
  beforeCommit?: () => void | Promise<void>;
}

/** tombstone 이메일 — userId 파생이라 unique 충돌이 사실상 불가능하고, 원 이메일을 즉시 해방한다 */
export function tombstoneEmailFor(userId: string): string {
  return `deleted+${userId}@deleted.invalid`;
}

/** eligibility 재검사 실패 시 transaction 전체 rollback용 내부 sentinel (토큰 소비까지 되돌린다) */
class DeletionBlockedError extends Error {
  constructor() {
    super('account deletion blocked by active obligations');
    this.name = 'DeletionBlockedError';
  }
}

const USER_GUARD_SELECT = {
  id: true,
  email: true,
  role: true,
  status: true,
  deletedAt: true,
} as const;

/**
 * 탈퇴 확인 메일 요청. limiter는 저장소 규약대로 DB 접근 전에 IP → user 순서로
 * 소비한다 (1C-1 보안 재검토 반영과 동일 — service.ts loginWithCredentials 참고).
 * 부적격 계정에는 메일을 보내지 않고 일반화된 결과만 반환한다.
 */
export async function requestAccountDeletion(
  input: { sessionUserId: string },
  ctx: RequestContext,
  deps: AuthServiceDeps = getDefaultAuthDeps(),
): Promise<RequestAccountDeletionResult> {
  await enforceLimit(deps.rateLimiters.deletionRequestByIp, limiterKey(ctx.ipAddress));
  await enforceLimit(deps.rateLimiters.deletionRequestByUser, limiterKey(input.sessionUserId));

  const user = await deps.db.user.findUnique({
    where: { id: input.sessionUserId },
    select: { ...USER_GUARD_SELECT, preferredLanguage: true },
  });
  if (!user || user.status !== 'ACTIVE' || user.deletedAt !== null || user.role !== 'TRAVELER') {
    return 'unsupported';
  }

  const eligibility = classifyDeletionEligibility(
    user,
    await loadDeletionObligations(deps.db, user.id),
  );
  if (!eligibility.eligible) {
    // role/status 계열은 위에서 걸러졌으므로 여기 도달은 운영 기록·비정상 상태다
    return 'blocked';
  }

  const rawToken = await replaceToken(
    deps,
    'accountDeletionToken',
    user.id,
    ACCOUNT_DELETION_TOKEN_TTL_MS,
  );
  await sendAuthEmail(
    deps,
    buildAccountDeletionEmail({
      to: user.email,
      preferredLanguage: user.preferredLanguage,
      rawToken,
    }),
  );
  return 'sent';
}

/**
 * confirm 화면(GET)용 읽기 전용 선검사 — DB를 변경하지 않으며 토큰을 소비하지 않는다.
 * 타인 토큰·미존재·사용됨은 구분 없이 'invalid'로 일반화한다.
 */
export async function getAccountDeletionPreflight(
  input: { sessionUserId: string; rawToken: string },
  deps: AuthServiceDeps = getDefaultAuthDeps(),
): Promise<AccountDeletionPreflight> {
  if (!isWellFormedAuthToken(input.rawToken)) {
    return 'invalid';
  }
  const tokenHash = hashToken(input.rawToken);
  const token = await deps.db.accountDeletionToken.findUnique({
    where: { tokenHash },
    select: { userId: true, usedAt: true, expiresAt: true },
  });
  if (!token || token.userId !== input.sessionUserId || token.usedAt !== null) {
    return 'invalid';
  }
  if (token.expiresAt.getTime() <= deps.now().getTime()) {
    return 'expired';
  }

  const user = await deps.db.user.findUnique({
    where: { id: input.sessionUserId },
    select: USER_GUARD_SELECT,
  });
  if (!user || user.status !== 'ACTIVE' || user.deletedAt !== null) {
    return 'invalid';
  }
  if (user.role !== 'TRAVELER') {
    return 'blocked';
  }
  const eligibility = classifyDeletionEligibility(
    user,
    await loadDeletionObligations(deps.db, user.id),
  );
  return eligibility.eligible ? 'ok' : 'blocked';
}

/**
 * 하드 익명화 본체 — 모든 DB 변경은 단일 Prisma transaction에서 수행한다.
 *
 * 순서: User FOR UPDATE → 재검증 → 토큰 원자적 소비(updateMany count===1) →
 * eligibility 재검사(실패 시 전체 rollback — 토큰 미소비 유지) → ephemeral 삭제 →
 * Account·인증 토큰 삭제 → User tombstone update → commit.
 *
 * 불변식: 전부 성공 또는 전부 rollback / 동일 토큰 동시 요청은 정확히 1회 성공
 * (User row 잠금이 직렬화, consume count가 중재) / User row는 절대 hard delete 금지 /
 * tombstone email unique 충돌(P2002)은 throw → 전체 rollback.
 */
export async function deleteAndAnonymizeTravelerAccount(
  input: { sessionUserId: string; rawToken: string },
  ctx: Pick<RequestContext, 'ipAddress'>,
  deps: AuthServiceDeps = getDefaultAuthDeps(),
  hooks?: AccountDeletionHooks,
): Promise<ConfirmAccountDeletionResult> {
  await enforceLimit(deps.rateLimiters.deletionConfirmByIp, limiterKey(ctx.ipAddress));
  // 형식 검증은 hash·limiter·DB보다 먼저 — 임의 입력으로 비용을 만들지 못하게 한다
  if (!isWellFormedAuthToken(input.rawToken)) {
    return 'invalid';
  }
  const tokenHash = hashToken(input.rawToken);
  // token limiter 키는 raw token이 아니라 hash의 HMAC (resetPasswordByToken과 동일)
  await enforceLimit(deps.rateLimiters.deletionConfirmByToken, limiterKey(tokenHash));

  const now = deps.now();

  let outcome: 'deleted' | 'invalid' | 'blocked' | 'consume-failed';
  try {
    outcome = await deps.db.$transaction(async (tx) => {
      // (1) 유일 직렬화 지점 — replaceToken과 동일한 잠금 순서(User 단일 row)
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${input.sessionUserId} FOR UPDATE`;

      // (2) 잠금 아래 재검증
      const user = await tx.user.findUnique({
        where: { id: input.sessionUserId },
        select: USER_GUARD_SELECT,
      });
      if (!user || user.status !== 'ACTIVE' || user.deletedAt !== null) {
        return 'invalid';
      }
      if (user.role !== 'TRAVELER') {
        return 'blocked';
      }

      // (3) 토큰 원자적 소비 — userId 일치 조건이 토큰-세션 결속을 강제한다
      const claimed = await tx.accountDeletionToken.updateMany({
        where: { tokenHash, userId: user.id, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (claimed.count !== 1) {
        return 'consume-failed';
      }
      await hooks?.afterTokenConsume?.();

      // (4) eligibility 재검사 — 실패는 부분 상태 없이 전체 rollback (토큰도 되살아난다)
      const eligibility = classifyDeletionEligibility(
        user,
        await loadDeletionObligations(tx, user.id),
      );
      if (!eligibility.eligible) {
        throw new DeletionBlockedError();
      }

      // (5) 사용자 소유 ephemeral 데이터 — 미소비·비계약성으로 판정된 것만 삭제
      await tx.travelerProfile.deleteMany({ where: { userId: user.id } });
      await tx.programFavorite.deleteMany({ where: { userId: user.id } });
      await tx.expertFavorite.deleteMany({ where: { userId: user.id } });
      // NotificationDelivery는 DB ON DELETE CASCADE로 함께 제거된다
      await tx.notification.deleteMany({ where: { userId: user.id } });
      await tx.matchRequest.deleteMany({ where: { userId: user.id } });
      // 미소비 ACTIVE 견적만 삭제 — EXPIRED/CONSUMED는 역사 기록으로 보존,
      // ACTIVE인데 Booking이 연결된 비정상은 (4)에서 이미 차단됐다
      await tx.bookingQuote.deleteMany({
        where: { travelerId: user.id, status: 'ACTIVE', booking: { is: null } },
      });
      // LoginAttempt는 FK 없이 raw email을 저장하므로 원 이메일 기준으로 직접 삭제
      await tx.loginAttempt.deleteMany({ where: { email: user.email } });

      // (6) 인증 identity 제거 — 소셜 재로그인·기존 credentials 로그인 차단
      await tx.account.deleteMany({ where: { userId: user.id } });
      await hooks?.afterAccountDelete?.();
      await tx.emailVerificationToken.deleteMany({ where: { userId: user.id } });
      await tx.passwordResetToken.deleteMany({ where: { userId: user.id } });
      await tx.accountDeletionToken.deleteMany({ where: { userId: user.id } });

      // (7)(8) 구조화 PII 익명화 + tombstone — id/role/createdAt은 역사 FK 무결성을 위해 유지
      await hooks?.beforeUserAnonymize?.();
      await tx.user.update({
        where: { id: user.id },
        data: {
          email: tombstoneEmailFor(user.id),
          passwordHash: null,
          name: null,
          image: null,
          emailVerified: null,
          fullName: null,
          nickname: null,
          phone: null,
          country: null,
          preferredLanguage: 'ko',
          preferredCurrency: 'KRW',
          timezone: 'Asia/Seoul',
          status: 'DELETED',
          deletedAt: now,
        },
      });
      await hooks?.beforeCommit?.();
      return 'deleted'; // (9) commit
    });
  } catch (error) {
    if (error instanceof DeletionBlockedError) {
      return 'blocked';
    }
    // P2002(tombstone 충돌)·주입 실패·인프라 오류 — 이미 전체 rollback됐다. 호출자가 일반화한다.
    throw error;
  }

  if (outcome !== 'consume-failed') {
    return outcome;
  }

  // 소비 실패 사후 분류 (쓰기 없음, resetPassword 사후 분류 미러) — UI 안내용
  const token = await deps.db.accountDeletionToken.findUnique({
    where: { tokenHash },
    select: { userId: true, usedAt: true, expiresAt: true },
  });
  if (!token || token.userId !== input.sessionUserId || token.usedAt !== null) {
    return 'invalid';
  }
  if (token.expiresAt.getTime() <= now.getTime()) {
    return 'expired';
  }
  return 'invalid';
}

// ── confirm POST 코어 — server action에서 cookie·세션만 배선하고 로직은 여기서 검증한다 ──

/** next/headers cookies()와 구조 호환되는 최소 인터페이스 (테스트는 fake store 주입) */
export interface DeletionCookieStore extends DeletionCookieReadStore {
  delete(spec: DeletionCookieClearSpec): unknown;
}

export type ConfirmDeletionCoreOutcome =
  | { kind: 'deleted' }
  | { kind: 'result'; status: 'invalid' | 'expired' | 'blocked' | 'error' }
  | { kind: 'rate-limited'; retryAfterMs: number | undefined };

/**
 * cookie에서 토큰을 읽어(환경별 정식 이름) 탈퇴를 수행하고, rate-limit을 제외한
 * 모든 결과에서 cookie를 제거한다 (성공·invalid·expired·blocked·error — 일반·
 * __Secure- 이름 모두 만료). rate-limit은 사용자가 잠시 후 같은 링크로 재시도할
 * 수 있어야 하므로 cookie를 유지한다. cookie 부재도 두 이름을 만료시킨 뒤 'invalid'로
 * 일반화한다(정식 cookie 없이 남은 stale cookie 정리).
 */
export async function confirmDeletionCore(
  params: {
    sessionUserId: string;
    ipAddress: string;
    cookieStore: DeletionCookieStore;
    cookiePath: string;
    isProduction: boolean;
  },
  deps: AuthServiceDeps = getDefaultAuthDeps(),
  hooks?: AccountDeletionHooks,
): Promise<ConfirmDeletionCoreOutcome> {
  const rawToken = readDeletionTokenCookie(params.cookieStore, params.isProduction);
  const clearCookies = () => {
    clearDeletionTokenCookies(params.cookieStore, params.cookiePath);
  };

  if (!rawToken) {
    clearCookies();
    return { kind: 'result', status: 'invalid' };
  }

  let result: ConfirmAccountDeletionResult;
  try {
    result = await deleteAndAnonymizeTravelerAccount(
      { sessionUserId: params.sessionUserId, rawToken },
      { ipAddress: params.ipAddress },
      deps,
      hooks,
    );
  } catch (error) {
    if (isAppError(error) && error.code === ERROR_CODES.RATE_LIMITED) {
      const retryAfterMs = (error.details as { retryAfterMs?: number } | undefined)?.retryAfterMs;
      return { kind: 'rate-limited', retryAfterMs };
    }
    // 고정 문자열만 기록 — exception message에 토큰·이메일·URL이 섞여 들어올 수
    // 있으므로 어떤 환경에서도 오류 객체·message를 출력하지 않는다
    console.error('[users] 계정 탈퇴 처리 실패');
    clearCookies();
    return { kind: 'result', status: 'error' };
  }

  clearCookies();
  if (result === 'deleted') {
    return { kind: 'deleted' };
  }
  return { kind: 'result', status: result };
}
