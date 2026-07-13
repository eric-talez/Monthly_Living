import { z } from 'zod';

import type { AuthServiceDeps } from './deps';
import { emailSchema } from './validation';

/**
 * OAuth 로그인 정책 (순수 모듈 — env·DB 싱글턴 import 금지, deps는 호출자가 주입).
 * Auth.js signIn callback(src/auth.ts)이 이 모듈의 evaluateOAuthSignIn만 호출한다 —
 * Credentials의 authorizeLogin과 같은 "단일 정책 지점" 구조.
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

// ── 원본 프로필 스키마 (boolean true 엄격 — truthy 문자열/숫자 불인정) ──────────

const googleRawProfileSchema = z.looseObject({
  sub: z.string().min(1),
  email: z.string().min(1),
  email_verified: z.literal(true),
});

const kakaoRawProfileSchema = z.looseObject({
  id: z.union([z.string().min(1), z.number()]),
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

/** Kakao userinfo JSON → User 필드. id 누락 시 undefined 유지. */
export function mapKakaoProfile(profile: Record<string, unknown>): MappedOAuthProfile {
  const account =
    typeof profile.kakao_account === 'object' && profile.kakao_account !== null
      ? (profile.kakao_account as Record<string, unknown>)
      : undefined;
  const kakaoProfile =
    account && typeof account.profile === 'object' && account.profile !== null
      ? (account.profile as Record<string, unknown>)
      : undefined;

  const rawId = profile.id;
  const id =
    typeof rawId === 'string' && rawId.length > 0
      ? rawId
      : typeof rawId === 'number' && Number.isFinite(rawId)
        ? rawId.toString()
        : undefined;
  const email = asOptionalString(account?.email);

  return {
    id,
    name: asOptionalString(kakaoProfile?.nickname),
    email: email === undefined ? undefined : normalizeEmailInput(email),
    image: asOptionalString(kakaoProfile?.profile_image_url),
  };
}

// ── signIn 정책 ────────────────────────────────────────────────────

export type OAuthSignInDenyReason =
  | 'unsupported-provider'
  | 'provider-account-id-invalid'
  | 'profile-rejected' // id/email 누락, 미검증 이메일, boolean 아님 등 — 스키마 불일치 전부
  | 'provider-account-id-mismatch'
  | 'email-invalid'
  | 'account-owner-not-active'
  | 'existing-user-not-active';

export type OAuthSignInDecision =
  | { allowed: true; kind: 'existing-account' | 'no-account' }
  | { allowed: false; reason: OAuthSignInDenyReason };

export interface OAuthSignInInput {
  providerId: string;
  /** 원본 OAuth 프로필 (Google: id_token claims / Kakao: userinfo JSON) */
  profile: unknown;
  /** Auth.js가 Account 조회·저장에 사용하는 값 — 원본 프로필의 id와 정확히 일치해야 한다 */
  providerAccountId: unknown;
}

/**
 * OAuth 로그인 허용 판정. 거부 사유는 호출자(signIn callback)가 false로만
 * 변환한다 — 사유는 감사·테스트용이며 사용자에게 구분 노출하지 않는다.
 *
 * 판정 순서:
 * 1) 프로필 검증(식별자 존재, provider 검증 이메일, boolean 엄격)
 * 2) providerAccountId가 원본 프로필 식별자와 정확히 일치하는지
 *    (@auth/core는 profile().id 누락 시 임의 UUID를 쓰므로 여기서 차단)
 * 3) 이메일 정규화(emailSchema — trim/lowercase/형식/길이)
 * 4) Account 존재(재로그인): 소유 user가 ACTIVE·미삭제일 때만 허용.
 *    소유자 재지정·이메일 갱신은 어떤 경우에도 하지 않는다.
 * 5) Account 없음: 동일 이메일 user가 비활성이면 거부. 활성이면 허용하되
 *    자동 연결은 하지 않는다(@auth/core가 OAuthAccountNotLinked로 중단 —
 *    fail-safe). 미존재면 신규 가입 허용.
 */
export async function evaluateOAuthSignIn(
  input: OAuthSignInInput,
  deps: Pick<AuthServiceDeps, 'db'>,
): Promise<OAuthSignInDecision> {
  if (!isOAuthProviderId(input.providerId)) {
    return { allowed: false, reason: 'unsupported-provider' };
  }
  if (typeof input.providerAccountId !== 'string' || input.providerAccountId.length === 0) {
    return { allowed: false, reason: 'provider-account-id-invalid' };
  }

  let profileId: string;
  let profileEmail: string;
  if (input.providerId === 'google') {
    const parsed = googleRawProfileSchema.safeParse(input.profile);
    if (!parsed.success) {
      return { allowed: false, reason: 'profile-rejected' };
    }
    profileId = parsed.data.sub;
    profileEmail = parsed.data.email;
  } else {
    const parsed = kakaoRawProfileSchema.safeParse(input.profile);
    if (!parsed.success) {
      return { allowed: false, reason: 'profile-rejected' };
    }
    profileId = String(parsed.data.id);
    profileEmail = parsed.data.kakao_account.email;
  }

  if (profileId !== input.providerAccountId) {
    return { allowed: false, reason: 'provider-account-id-mismatch' };
  }

  const parsedEmail = emailSchema.safeParse(profileEmail);
  if (!parsedEmail.success) {
    return { allowed: false, reason: 'email-invalid' };
  }
  const email = parsedEmail.data;

  const account = await deps.db.account.findUnique({
    where: {
      provider_providerAccountId: {
        provider: input.providerId,
        providerAccountId: input.providerAccountId,
      },
    },
    select: { user: { select: { status: true, deletedAt: true } } },
  });
  if (account) {
    if (account.user.status !== 'ACTIVE' || account.user.deletedAt !== null) {
      return { allowed: false, reason: 'account-owner-not-active' };
    }
    return { allowed: true, kind: 'existing-account' };
  }

  const userByEmail = await deps.db.user.findUnique({
    where: { email },
    select: { status: true, deletedAt: true },
  });
  if (userByEmail && (userByEmail.status !== 'ACTIVE' || userByEmail.deletedAt !== null)) {
    return { allowed: false, reason: 'existing-user-not-active' };
  }

  return { allowed: true, kind: 'no-account' };
}
