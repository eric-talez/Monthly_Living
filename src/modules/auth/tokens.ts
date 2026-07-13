import { createHash, createHmac, randomBytes } from 'node:crypto';

/**
 * 인증 토큰·HMAC 헬퍼 (순수 모듈 — DB·env import 금지).
 *
 * 토큰 원문은 이메일 링크로만 전달되고 DB에는 sha256 hash만 저장한다
 * (prisma/models/identity.prisma EmailVerificationToken/PasswordResetToken.tokenHash).
 */

/** 256-bit entropy 원문 토큰 — URL-safe base64 */
export function generateRawToken(): string {
  return randomBytes(32).toString('base64url');
}

// 형식 검증은 crypto-free 모듈로 분리 (proxy.ts가 사용) — 기존 import 호환용 re-export.
export { AUTH_TOKEN_PATTERN, isWellFormedAuthToken } from './token-pattern';

/** DB 저장용 토큰 hash — 원문은 절대 저장·로그하지 않는다 */
export function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

/**
 * Rate limit 키용 HMAC — limiter 메모리에 raw 이메일이 남지 않도록
 * 정규화된 값을 AUTH_SECRET 기반 HMAC으로 치환한다.
 */
export function hashRateLimitKey(secret: string, value: string): string {
  return createHmac('sha256', secret).update(value).digest('hex');
}

/**
 * Credentials 세션의 credentialVersion 클레임.
 * raw passwordHash를 JWT에 싣지 않기 위해 HMAC digest만 사용한다 —
 * 비밀번호 재설정으로 passwordHash가 바뀌면 digest가 달라져
 * 기존 JWT 세션이 다음 세션 읽기에서 무효화된다 (src/auth.ts jwt callback).
 */
export function credentialVersionDigest(secret: string, passwordHash: string): string {
  return createHmac('sha256', secret).update(passwordHash).digest('hex');
}
