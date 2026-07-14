/**
 * 인증 정책 상수 — 값 변경은 이 파일에서만 한다.
 * (순수 상수 모듈: DB·env import 금지 — unit test가 환경 없이 로드한다)
 */

export const PASSWORD_MIN_LENGTH = 8;

/**
 * bcrypt는 UTF-8 인코딩 기준 72바이트까지만 입력을 반영하고 초과분을
 * 조용히 잘라낸다(silent truncation). 문자 수가 아니라 **바이트 수**로
 * 제한해야 한글(3B)·이모지(4B) 비밀번호가 잘린 채 저장되는 사고를 막는다.
 */
export const PASSWORD_MAX_BYTES = 72;

/** RFC 5321 기준 메일 주소 상한 — 입력 경계용 (스키마 emailSchema.max) */
export const EMAIL_MAX_LENGTH = 254;

/** prisma/seed.ts의 hashSync(TEST_PASSWORD, 12)와 반드시 일치해야 한다. */
export const BCRYPT_COST = 12;

export const EMAIL_VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24시간
export const PASSWORD_RESET_TOKEN_TTL_MS = 30 * 60 * 1000; // 30분
export const ACCOUNT_DELETION_TOKEN_TTL_MS = 30 * 60 * 1000; // 30분

/** 회원가입 시 기록하는 약관·개인정보 버전 — seed의 termsVersion과 일치 */
export const CONSENT_TERMS_VERSION = '2026-07-01';

/**
 * Rate limit 한도 — LoginAttempt(감사 기록)와 별개인 제어 장치다.
 * email 키는 raw 값이 아니라 HMAC 처리해 사용한다 (tokens.ts hashRateLimitKey).
 */
export const AUTH_RATE_LIMITS = {
  loginByEmail: { max: 5, windowMs: 15 * 60 * 1000 },
  loginByIp: { max: 20, windowMs: 15 * 60 * 1000 },
  registerByIp: { max: 5, windowMs: 60 * 60 * 1000 },
  resendVerificationByEmail: { max: 3, windowMs: 15 * 60 * 1000 },
  resendVerificationByIp: { max: 10, windowMs: 60 * 60 * 1000 },
  resetRequestByEmail: { max: 3, windowMs: 60 * 60 * 1000 },
  resetRequestByIp: { max: 10, windowMs: 60 * 60 * 1000 },
  // 재설정 완료(토큰 소비) 경로 — bcrypt 비용 유발을 IP·토큰 단위로 제한.
  // token 키는 raw token이 아니라 sha256 hash를 HMAC 처리해 사용한다.
  resetPasswordByIp: { max: 10, windowMs: 60 * 60 * 1000 },
  resetPasswordByToken: { max: 5, windowMs: 15 * 60 * 1000 },
  // 계정 탈퇴 — 요청은 userId(HMAC)·IP 키, 확인(토큰 소비)은 token hash(HMAC)·IP 키.
  // 복합 소비 순서는 다른 흐름과 동일하게 IP 우선 (modules/users/account-deletion.ts).
  deletionRequestByUser: { max: 3, windowMs: 60 * 60 * 1000 },
  deletionRequestByIp: { max: 10, windowMs: 60 * 60 * 1000 },
  deletionConfirmByToken: { max: 5, windowMs: 15 * 60 * 1000 },
  deletionConfirmByIp: { max: 10, windowMs: 60 * 60 * 1000 },
} as const;

export type AuthRateLimitName = keyof typeof AUTH_RATE_LIMITS;
