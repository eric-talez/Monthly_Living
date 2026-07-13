import { z } from 'zod';

import { emailSchema } from './validation';

/**
 * OAuth 프로필 검증·매핑 (순수 모듈 — env·DB import 금지).
 * DB를 사용하는 identity 판정·생성은 modules/auth/oauth-identity.ts가 담당하고,
 * 이 모듈은 provider가 보낸 원본 프로필의 형태 검증만 책임진다.
 *
 * provider가 검증한 이메일만 신뢰한다:
 * - Google(OIDC id_token claims): `email_verified`가 boolean true일 때만
 * - Kakao(userinfo JSON): `is_email_valid`와 `is_email_verified`가 모두 boolean true일 때만
 * 이 검사는 신규 가입뿐 아니라 재로그인에도 적용된다 — provider 쪽에서 이메일
 * 검증이 풀린 계정은 로그인 자체를 거부한다 (fail-safe).
 */

export const OAUTH_PROVIDER_IDS = ['google', 'kakao'] as const;
export type OAuthProviderId = (typeof OAUTH_PROVIDER_IDS)[number];

export function isOAuthProviderId(value: unknown): value is OAuthProviderId {
  return (OAUTH_PROVIDER_IDS as readonly string[]).includes(value as string);
}

/** trim+lowercase만 수행 — 형식의 최종 판정은 emailSchema가 담당한다 */
function normalizeEmailInput(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Kakao 회원번호 정규화 — 숫자면 안전 정수(비음수)만, 문자열이면 trim 후
 * 숫자만 1~20자리만 인정한다. NaN/Infinity/소수/음수/2^53 초과(JSON 파싱
 * 정밀도 손실 위험)·빈 문자열·비숫자 형식은 전부 undefined(거부)로 수렴한다.
 */
export const KAKAO_ID_STRING_PATTERN = /^[0-9]{1,20}$/;

export function normalizeKakaoId(value: unknown): string | undefined {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value >= 0 ? value.toString() : undefined;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return KAKAO_ID_STRING_PATTERN.test(trimmed) ? trimmed : undefined;
  }
  return undefined;
}

// ── 원본 프로필 스키마 (boolean true 엄격 — truthy 문자열/숫자 불인정) ──────────

const googleRawProfileSchema = z.looseObject({
  sub: z.string().min(1),
  email: z.string().min(1),
  email_verified: z.literal(true),
});

const kakaoRawProfileSchema = z.looseObject({
  id: z.unknown().refine((value) => normalizeKakaoId(value) !== undefined),
  kakao_account: z.looseObject({
    email: z.string().min(1),
    is_email_valid: z.literal(true),
    is_email_verified: z.literal(true),
  }),
});

// ── provider profile() 매핑 — Prisma User 컬럼만 반환, 절대 throw하지 않는다 ────
// (정책 판정은 전부 signIn callback 경유 — profile()에서 던지면
//  OAuthProfileParseError로 흘러 정책 지점을 우회하기 때문)

interface MappedOAuthProfile {
  id?: string;
  name?: string;
  email?: string;
  image?: string;
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** Google OIDC id_token claims → User 필드. id(sub) 누락 시 undefined 유지(강제 문자열화 금지). */
export function mapGoogleProfile(profile: Record<string, unknown>): MappedOAuthProfile {
  const email = asOptionalString(profile.email);
  return {
    id: asOptionalString(profile.sub),
    name: asOptionalString(profile.name),
    email: email === undefined ? undefined : normalizeEmailInput(email),
    image: asOptionalString(profile.picture),
  };
}

/** Kakao userinfo JSON → User 필드. id는 normalizeKakaoId 통과 값만(아니면 undefined 유지). */
export function mapKakaoProfile(profile: Record<string, unknown>): MappedOAuthProfile {
  const account =
    typeof profile.kakao_account === 'object' && profile.kakao_account !== null
      ? (profile.kakao_account as Record<string, unknown>)
      : undefined;
  const kakaoProfile =
    account && typeof account.profile === 'object' && account.profile !== null
      ? (account.profile as Record<string, unknown>)
      : undefined;

  const email = asOptionalString(account?.email);

  return {
    id: normalizeKakaoId(profile.id),
    name: asOptionalString(kakaoProfile?.nickname),
    email: email === undefined ? undefined : normalizeEmailInput(email),
    image: asOptionalString(kakaoProfile?.profile_image_url),
  };
}

// ── 프로필 검증 (signIn callback의 1단계 — DB 접근 없음) ─────────────────

export type OAuthProfileRejectReason =
  | 'unsupported-provider'
  | 'provider-account-id-invalid'
  | 'profile-rejected' // id/email 누락, 미검증 이메일, boolean 아님, unsafe id 등 — 스키마 불일치 전부
  | 'provider-account-id-mismatch'
  | 'email-invalid';

export type OAuthProfileValidation =
  | {
      ok: true;
      providerId: OAuthProviderId;
      providerAccountId: string;
      /** emailSchema 정규화(trim/lowercase/형식/254자) 통과 값 */
      email: string;
      name?: string;
      image?: string;
    }
  | { ok: false; reason: OAuthProfileRejectReason };

export interface OAuthProfileInput {
  providerId: string;
  /** 원본 OAuth 프로필 (Google: id_token claims / Kakao: userinfo JSON) */
  profile: unknown;
  /** Auth.js가 Account 조회·저장에 사용하는 값 — 원본 프로필의 id와 정확히 일치해야 한다 */
  providerAccountId: unknown;
}

/**
 * 원본 프로필 검증 — 실패 사유는 감사·테스트용이며 사용자에게 구분 노출하지 않는다.
 *
 * 판정 순서:
 * 1) 프로필 스키마(식별자 존재·형식, provider 검증 이메일, boolean 엄격)
 * 2) providerAccountId가 원본 프로필 식별자와 정확히 일치하는지
 *    (@auth/core는 profile().id 누락 시 임의 UUID를 쓰므로 여기서 차단)
 * 3) 이메일 정규화(emailSchema)
 */
export function validateOAuthProfile(input: OAuthProfileInput): OAuthProfileValidation {
  if (!isOAuthProviderId(input.providerId)) {
    return { ok: false, reason: 'unsupported-provider' };
  }
  if (typeof input.providerAccountId !== 'string' || input.providerAccountId.length === 0) {
    return { ok: false, reason: 'provider-account-id-invalid' };
  }

  let profileId: string;
  let profileEmail: string;
  let name: string | undefined;
  let image: string | undefined;
  if (input.providerId === 'google') {
    const parsed = googleRawProfileSchema.safeParse(input.profile);
    if (!parsed.success) {
      return { ok: false, reason: 'profile-rejected' };
    }
    profileId = parsed.data.sub;
    profileEmail = parsed.data.email;
    const mapped = mapGoogleProfile(parsed.data);
    name = mapped.name;
    image = mapped.image;
  } else {
    const parsed = kakaoRawProfileSchema.safeParse(input.profile);
    if (!parsed.success) {
      return { ok: false, reason: 'profile-rejected' };
    }
    // refine 통과가 보장하므로 non-null — 정규화 값으로 비교한다
    profileId = normalizeKakaoId(parsed.data.id)!;
    profileEmail = parsed.data.kakao_account.email;
    const mapped = mapKakaoProfile(parsed.data);
    name = mapped.name;
    image = mapped.image;
  }

  if (profileId !== input.providerAccountId) {
    return { ok: false, reason: 'provider-account-id-mismatch' };
  }

  const parsedEmail = emailSchema.safeParse(profileEmail);
  if (!parsedEmail.success) {
    return { ok: false, reason: 'email-invalid' };
  }

  return {
    ok: true,
    providerId: input.providerId,
    providerAccountId: input.providerAccountId,
    email: parsedEmail.data,
    name,
    image,
  };
}
