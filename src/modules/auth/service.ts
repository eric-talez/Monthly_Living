import 'server-only';

import type { RateLimiter } from '@/adapters/rate-limit/types';
import { Prisma, type UserRole, type UserStatus } from '@/generated/prisma/client';
import type { AppLocale } from '@/i18n/routing';
import { env } from '@/lib/env';
import { AppError, ERROR_CODES } from '@/lib/errors';

import {
  CONSENT_TERMS_VERSION,
  EMAIL_VERIFICATION_TOKEN_TTL_MS,
  PASSWORD_RESET_TOKEN_TTL_MS,
} from './constants';
import { getDefaultAuthDeps, type AuthServiceDeps } from './deps';
import { buildPasswordResetEmail, buildVerificationEmail } from './emails';
import { DUMMY_PASSWORD_HASH } from './passwords';
import {
  credentialVersionDigest,
  hashRateLimitKey,
  hashToken,
  isWellFormedAuthToken,
} from './tokens';
import { loginSchema } from './validation';
import type { EmailOnlyInput, LoginInput, RegisterInput } from './validation';

/**
 * 인증 도메인 서비스 — 모든 비즈니스 로직·DB 접근은 이 파일을 경유한다.
 * route handler / server action / Auth.js authorize는 얇은 어댑터로만 유지한다.
 *
 * 로그 규칙: 비밀번호·passwordHash·토큰 원문은 어떤 로그에도 남기지 않는다.
 */

export interface RequestContext {
  ipAddress: string;
  locale: AppLocale;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  status: UserStatus;
  /** passwordHash의 HMAC digest — 재설정 시 세션 무효화용. raw hash는 절대 아님 */
  credentialVersion: string;
}

export interface SessionClaims {
  role: UserRole;
  status: UserStatus;
  deletedAt: Date | null;
  /** passwordHash 기반 HMAC digest, 소셜 전용(passwordHash null)이면 null */
  credentialDigest: string | null;
}

export type RegisterOutcome = 'created' | 'existing-account';
export type VerifyEmailResult = 'verified' | 'already-verified' | 'expired' | 'invalid';
export type ResetPasswordResult = 'success' | 'expired' | 'invalid';

/** limiter 키 — raw 값(email/IP/userId/token hash)이 limiter 메모리에 남지 않도록 HMAC 처리 */
export function limiterKey(value: string): string {
  return hashRateLimitKey(env.AUTH_SECRET, value);
}

export async function enforceLimit(limiter: RateLimiter, key: string): Promise<void> {
  const decision = await limiter.limit(key);
  if (!decision.allowed) {
    throw new AppError(ERROR_CODES.RATE_LIMITED, 'Too many requests.', {
      details: { retryAfterMs: decision.retryAfterMs },
    });
  }
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/**
 * 회원가입. 외부 응답은 신규/기존 계정 모두 동일한 성공 형태다 —
 * 중복 이메일이어도 어떤 메일도 발송하지 않는다(계정 열거 방지).
 * 재발송은 /verify-email/sent의 전용 기능(resendVerificationEmail)만 사용한다.
 */
export async function registerUser(
  input: RegisterInput,
  ctx: RequestContext,
  deps: AuthServiceDeps = getDefaultAuthDeps(),
): Promise<{ outcome: RegisterOutcome }> {
  await enforceLimit(deps.rateLimiters.registerByIp, limiterKey(ctx.ipAddress));

  const passwordHash = await deps.hashPassword(input.password);
  const rawToken = deps.generateToken();
  const tokenHash = hashToken(rawToken);
  const now = deps.now();

  let outcome: RegisterOutcome = 'created';
  try {
    const created = await deps.db.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({
        where: { email: input.email },
        select: { id: true },
      });
      if (existing) {
        return false;
      }

      const user = await tx.user.create({
        data: {
          email: input.email,
          passwordHash,
          preferredLanguage: ctx.locale,
        },
        select: { id: true },
      });

      // 필수 약관·개인정보 + 선택 마케팅 동의를 가입과 같은 transaction에 기록 (append-only)
      await tx.consentRecord.createMany({
        data: [
          { userId: user.id, type: 'TERMS', version: CONSENT_TERMS_VERSION, granted: true },
          { userId: user.id, type: 'PRIVACY', version: CONSENT_TERMS_VERSION, granted: true },
          {
            userId: user.id,
            type: 'MARKETING',
            version: CONSENT_TERMS_VERSION,
            granted: input.marketingAccepted,
          },
        ],
      });

      await tx.emailVerificationToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt: new Date(now.getTime() + EMAIL_VERIFICATION_TOKEN_TTL_MS),
        },
      });

      return true;
    });
    outcome = created ? 'created' : 'existing-account';
  } catch (error) {
    // 중복 조회와 create 사이의 race — unique 위반은 기존 계정과 동일하게 처리
    if (!isUniqueViolation(error)) {
      throw error;
    }
    outcome = 'existing-account';
  }

  if (outcome === 'created') {
    await sendAuthEmail(
      deps,
      buildVerificationEmail({ to: input.email, preferredLanguage: ctx.locale, rawToken }),
    );
  }

  return { outcome };
}

/**
 * Credentials 로그인의 단일 강제 지점 — Auth.js authorize()가 이 함수만 호출한다.
 * 실패 사유(미존재/비밀번호 불일치/미인증/정지/삭제)는 전부 null로 수렴하고
 * 구분은 LoginAttempt 감사 기록에만 남는다(성공 여부만).
 */
export async function loginWithCredentials(
  input: LoginInput,
  ctx: Pick<RequestContext, 'ipAddress'>,
  deps: AuthServiceDeps = getDefaultAuthDeps(),
): Promise<AuthUser | null> {
  // limiter 차단 시 RATE_LIMITED throw — 차단된 시도는 LoginAttempt에 기록하지 않는다
  // (해머링 중 쓰기 증폭 방지 — docs/decisions/client-ip-and-rate-limit.md)
  // IP를 먼저 소비한다: IP 제한에 이미 걸린 공격 요청이 피해자 email 한도를
  // 태워 정상 사용자를 잠그지 못하게 하기 위함이다 (다른 복합 flow도 동일).
  await enforceLimit(deps.rateLimiters.loginByIp, limiterKey(ctx.ipAddress));
  await enforceLimit(deps.rateLimiters.loginByEmail, limiterKey(input.email));

  const user = await deps.db.user.findUnique({ where: { email: input.email } });

  // 미존재·소셜 전용 계정에도 bcrypt 비교 1회 수행 — 타이밍으로 존재 여부 구분 방지
  const passwordMatches = await deps.verifyPassword(
    input.password,
    user?.passwordHash ?? DUMMY_PASSWORD_HASH,
  );

  const succeeded =
    user !== null &&
    user.passwordHash !== null &&
    passwordMatches &&
    user.emailVerified !== null &&
    user.status === 'ACTIVE' &&
    user.deletedAt === null;

  await deps.db.loginAttempt.create({
    data: { email: input.email, ipAddress: ctx.ipAddress, succeeded },
  });

  if (!succeeded || user.passwordHash === null) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    status: user.status,
    credentialVersion: credentialVersionDigest(env.AUTH_SECRET, user.passwordHash),
  };
}

/**
 * Auth.js Credentials authorize의 검증 본체 — src/auth.ts는 이 함수에 위임만 한다.
 * 스키마 실패(초과 길이 비밀번호 포함)는 서비스 호출 없이 null로 수렴하므로
 * bcrypt까지 도달하지 않는다. RATE_LIMITED AppError는 그대로 통과시키고
 * CredentialsSignin 변환은 auth.ts가 담당한다 (service는 next-auth 미의존).
 */
export async function authorizeLogin(
  credentials: unknown,
  ctx: Pick<RequestContext, 'ipAddress'>,
  deps: AuthServiceDeps = getDefaultAuthDeps(),
): Promise<AuthUser | null> {
  const parsed = loginSchema.safeParse(credentials);
  if (!parsed.success) {
    // 형식 오류도 일반 실패와 동일하게 — null이면 Auth.js core가 CredentialsSignin으로 변환한다
    return null;
  }
  return loginWithCredentials(parsed.data, ctx, deps);
}

/** JWT callback의 세션 재검증용 — 세션 읽기마다 호출된다 (src/auth.ts) */
export async function getSessionClaims(
  userId: string,
  deps: AuthServiceDeps = getDefaultAuthDeps(),
): Promise<SessionClaims | null> {
  const user = await deps.db.user.findUnique({
    where: { id: userId },
    select: { role: true, status: true, deletedAt: true, passwordHash: true },
  });
  if (!user) {
    return null;
  }
  return {
    role: user.role,
    status: user.status,
    deletedAt: user.deletedAt,
    credentialDigest:
      user.passwordHash === null
        ? null
        : credentialVersionDigest(env.AUTH_SECRET, user.passwordHash),
  };
}

/**
 * 새 토큰 발급 시 기존 미사용 토큰을 삭제하고 신규 생성한다 (사용된 토큰은 감사용 보존).
 * 동시 발급으로 활성 토큰이 복수가 되지 않도록 대상 User row를 잠근 뒤 수행한다.
 */
export async function replaceToken(
  deps: AuthServiceDeps,
  model: 'emailVerificationToken' | 'passwordResetToken' | 'accountDeletionToken',
  userId: string,
  ttlMs: number,
): Promise<string> {
  const rawToken = deps.generateToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(deps.now().getTime() + ttlMs);

  await deps.db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
    if (model === 'emailVerificationToken') {
      await tx.emailVerificationToken.deleteMany({ where: { userId, usedAt: null } });
      await tx.emailVerificationToken.create({ data: { userId, tokenHash, expiresAt } });
    } else if (model === 'passwordResetToken') {
      await tx.passwordResetToken.deleteMany({ where: { userId, usedAt: null } });
      await tx.passwordResetToken.create({ data: { userId, tokenHash, expiresAt } });
    } else {
      await tx.accountDeletionToken.deleteMany({ where: { userId, usedAt: null } });
      await tx.accountDeletionToken.create({ data: { userId, tokenHash, expiresAt } });
    }
  });

  return rawToken;
}

/** 인증 메일 재전송 — 미존재/이미 인증/비활성 계정은 조용한 성공 (응답 동일) */
export async function resendVerificationEmail(
  input: EmailOnlyInput,
  ctx: RequestContext,
  deps: AuthServiceDeps = getDefaultAuthDeps(),
): Promise<void> {
  // IP 우선 — loginWithCredentials의 limiter 순서 주석 참고
  await enforceLimit(deps.rateLimiters.resendVerificationByIp, limiterKey(ctx.ipAddress));
  await enforceLimit(deps.rateLimiters.resendVerificationByEmail, limiterKey(input.email));

  const user = await deps.db.user.findUnique({ where: { email: input.email } });
  if (!user || user.emailVerified !== null || user.status !== 'ACTIVE' || user.deletedAt !== null) {
    return;
  }

  const rawToken = await replaceToken(
    deps,
    'emailVerificationToken',
    user.id,
    EMAIL_VERIFICATION_TOKEN_TTL_MS,
  );
  await sendAuthEmail(
    deps,
    buildVerificationEmail({
      to: user.email,
      preferredLanguage: user.preferredLanguage,
      rawToken,
    }),
  );
}

/**
 * 이메일 인증 — 소비는 usedAt·expiresAt 조건을 포함한 원자적 updateMany로만 결정한다.
 * count가 1일 때만 같은 transaction에서 emailVerified를 설정한다.
 */
export async function verifyEmail(
  rawToken: string,
  deps: AuthServiceDeps = getDefaultAuthDeps(),
): Promise<VerifyEmailResult> {
  // 형식(43자 base64url) 선검증 — 임의 길이 입력의 hash·DB 조회 비용 차단 (입력 경계)
  if (!isWellFormedAuthToken(rawToken)) {
    return 'invalid';
  }
  const tokenHash = hashToken(rawToken);
  const now = deps.now();

  const consumed = await deps.db.$transaction(async (tx) => {
    const claimed = await tx.emailVerificationToken.updateMany({
      where: { tokenHash, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (claimed.count !== 1) {
      return false;
    }
    const token = await tx.emailVerificationToken.findUniqueOrThrow({
      where: { tokenHash },
      select: { userId: true },
    });
    await tx.user.update({ where: { id: token.userId }, data: { emailVerified: now } });
    return true;
  });

  if (consumed) {
    return 'verified';
  }

  // 소비 실패의 분류는 사용자 안내 용도일 뿐 — 상태 변경은 위의 원자적 소비만 수행한다
  const token = await deps.db.emailVerificationToken.findUnique({
    where: { tokenHash },
    select: { usedAt: true, expiresAt: true, user: { select: { emailVerified: true } } },
  });
  if (!token) {
    return 'invalid';
  }
  if (token.usedAt !== null) {
    return token.user.emailVerified !== null ? 'already-verified' : 'invalid';
  }
  if (token.expiresAt.getTime() <= now.getTime()) {
    return 'expired';
  }
  return 'invalid';
}

/** 비밀번호 재설정 요청 — 이메일 존재 여부와 무관하게 응답 동일 (조용한 성공) */
export async function requestPasswordReset(
  input: EmailOnlyInput,
  ctx: RequestContext,
  deps: AuthServiceDeps = getDefaultAuthDeps(),
): Promise<void> {
  // IP 우선 — loginWithCredentials의 limiter 순서 주석 참고
  await enforceLimit(deps.rateLimiters.resetRequestByIp, limiterKey(ctx.ipAddress));
  await enforceLimit(deps.rateLimiters.resetRequestByEmail, limiterKey(input.email));

  const user = await deps.db.user.findUnique({ where: { email: input.email } });
  // 소셜 전용(passwordHash null) 계정은 재설정할 비밀번호가 없다 — 동일하게 조용한 성공
  if (!user || user.passwordHash === null || user.status !== 'ACTIVE' || user.deletedAt !== null) {
    return;
  }

  const rawToken = await replaceToken(
    deps,
    'passwordResetToken',
    user.id,
    PASSWORD_RESET_TOKEN_TTL_MS,
  );
  await sendAuthEmail(
    deps,
    buildPasswordResetEmail({
      to: user.email,
      preferredLanguage: user.preferredLanguage,
      rawToken,
    }),
  );
}

/**
 * 비밀번호 재설정 — 원자적 소비(usedAt·expiresAt 조건) 후 같은 transaction에서
 * 새 hash 저장 + 나머지 미사용 재설정 토큰 삭제. passwordHash가 바뀌면
 * credentialVersion digest가 달라져 기존 JWT 세션이 무효화된다 (src/auth.ts).
 *
 * bcrypt(cost 12)는 공개 경로에서 가장 비싼 연산이므로 저비용 검사를 모두
 * 통과한 뒤에만 실행한다: IP limiter → 형식 → token limiter(hash 키) →
 * preflight 조회 → bcrypt → 원자적 소비. preflight는 DoS 방어용 선별일 뿐이고
 * 소비 가능 여부의 최종 권위는 기존 원자적 updateMany다 (동시 소비 race 포함).
 */
export async function resetPassword(
  input: { rawToken: string; newPassword: string },
  ctx: Pick<RequestContext, 'ipAddress'>,
  deps: AuthServiceDeps = getDefaultAuthDeps(),
): Promise<ResetPasswordResult> {
  await enforceLimit(deps.rateLimiters.resetPasswordByIp, limiterKey(ctx.ipAddress));

  // 형식(43자 base64url) 선검증 — 이후 hash가 limiter 키가 되므로
  // 무제한 길이 입력은 hash 계산 전에 여기서 걸러진다. UI에는 일반 invalid로만 노출.
  if (!isWellFormedAuthToken(input.rawToken)) {
    return 'invalid';
  }
  const tokenHash = hashToken(input.rawToken);
  await enforceLimit(deps.rateLimiters.resetPasswordByToken, limiterKey(tokenHash));

  const now = deps.now();

  // bcrypt 전 저비용 preflight — 사후 분류 블록과 동일한 술어·순서를 유지한다.
  // 여기서 통과해도 동시 소비로 뒤에서 질 수 있다(TOCTOU 허용) — 최종 판정은 아래 transaction.
  const preflight = await deps.db.passwordResetToken.findUnique({
    where: { tokenHash },
    select: { usedAt: true, expiresAt: true },
  });
  if (!preflight || preflight.usedAt !== null) {
    return 'invalid';
  }
  if (preflight.expiresAt.getTime() <= now.getTime()) {
    return 'expired';
  }

  const newPasswordHash = await deps.hashPassword(input.newPassword);

  const consumed = await deps.db.$transaction(async (tx) => {
    const claimed = await tx.passwordResetToken.updateMany({
      where: { tokenHash, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (claimed.count !== 1) {
      return false;
    }
    const token = await tx.passwordResetToken.findUniqueOrThrow({
      where: { tokenHash },
      select: { userId: true },
    });
    await tx.user.update({
      where: { id: token.userId },
      data: { passwordHash: newPasswordHash },
    });
    await tx.passwordResetToken.deleteMany({ where: { userId: token.userId, usedAt: null } });
    return true;
  });

  if (consumed) {
    return 'success';
  }

  const token = await deps.db.passwordResetToken.findUnique({
    where: { tokenHash },
    select: { usedAt: true, expiresAt: true },
  });
  if (!token || token.usedAt !== null) {
    return 'invalid';
  }
  if (token.expiresAt.getTime() <= now.getTime()) {
    return 'expired';
  }
  return 'invalid';
}

/**
 * 메일 발송 실패는 흐름을 깨지 않는다 — 재전송 경로가 있으므로 기록만 남긴다.
 * 고정 문자열만 출력한다: provider 오류 객체·message에는 수신자 이메일·확인 URL·
 * raw token이 섞여 들어올 수 있으므로 어떤 환경에서도 기록하지 않는다.
 */
export async function sendAuthEmail(
  deps: AuthServiceDeps,
  message: Parameters<AuthServiceDeps['emailProvider']['send']>[0],
): Promise<void> {
  try {
    await deps.emailProvider.send(message);
  } catch {
    console.error('[auth] 이메일 발송 실패');
  }
}
