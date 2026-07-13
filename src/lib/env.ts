import 'server-only';

import { z } from 'zod';

/**
 * 서버 환경변수 스키마 — client component에서 import 금지 (server-only 가드).
 * 새 환경변수는 반드시 여기에 추가하고 .env.example에도 함께 기록한다.
 * 검증 실패 시 어떤 변수가 왜 잘못되었는지 명확한 메시지와 함께 기동을 중단한다.
 */

/** OAuth credential 값 — 공백만 있는 값은 미설정이 아니라 오류다 (fail-closed) */
const oauthCredentialSchema = z
  .string()
  .trim()
  .min(1, 'must not be empty or whitespace-only. Unset it to disable the provider.')
  .optional();

/** ID/secret 쌍이 함께 설정됐을 때만 provider가 활성화된다 — 부분 설정은 기동 오류 */
const OAUTH_PROVIDER_ENV_PAIRS = [
  ['AUTH_GOOGLE_ID', 'AUTH_GOOGLE_SECRET'],
  ['AUTH_KAKAO_ID', 'AUTH_KAKAO_SECRET'],
] as const;

const serverEnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    APP_URL: z.url().default('http://localhost:3000'),
    // fail-closed: 기본값 없음 — 미설정이면 DB 초기화는 명확하게 실패한다 (.env.example 참고)
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required. See .env.example.'),
    // 통합 테스트 전용 (선택) — 이름에 _test 필수, scripts/db-reset.ts가 검증
    TEST_DATABASE_URL: z.string().min(1).optional(),
    // Auth.js JWT 서명·암호화 및 rate limit 키 HMAC에 사용 — fail-closed, 직접 생성 (.env.example 참고)
    AUTH_SECRET: z
      .string()
      .min(
        32,
        'AUTH_SECRET is required (generate with `openssl rand -base64 32`). See .env.example.',
      ),
    // 이메일 어댑터 선택 — Phase 1C는 console만 (production 전환 조건: README 출시 Gate)
    EMAIL_PROVIDER: z.enum(['console']).default('console'),
    // ── OAuth (선택) — ID/secret이 모두 설정된 provider만 활성화 (.env.example 참고) ──
    AUTH_GOOGLE_ID: oauthCredentialSchema,
    AUTH_GOOGLE_SECRET: oauthCredentialSchema,
    AUTH_KAKAO_ID: oauthCredentialSchema,
    AUTH_KAKAO_SECRET: oauthCredentialSchema,
  })
  .superRefine((value, ctx) => {
    for (const [idKey, secretKey] of OAUTH_PROVIDER_ENV_PAIRS) {
      const hasId = value[idKey] !== undefined;
      const hasSecret = value[secretKey] !== undefined;
      if (hasId !== hasSecret) {
        ctx.addIssue({
          code: 'custom',
          path: [hasId ? secretKey : idKey],
          message: `${idKey} and ${secretKey} must be set together — partial OAuth configuration is refused (set both to enable the provider, or neither to disable it). See .env.example.`,
        });
      }
    }
  });

export type ServerEnv = z.infer<typeof serverEnvSchema>;

function loadServerEnv(): ServerEnv {
  const parsed = serverEnvSchema.safeParse(process.env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');

    throw new Error(
      `[env] Invalid environment variables:\n${issues}\n` +
        'See .env.example for the required configuration.',
    );
  }

  return parsed.data;
}

export const env = loadServerEnv();
