import 'server-only';

import { z } from 'zod';

/**
 * 서버 환경변수 스키마 — client component에서 import 금지 (server-only 가드).
 * 새 환경변수는 반드시 여기에 추가하고 .env.example에도 함께 기록한다.
 * 검증 실패 시 어떤 변수가 왜 잘못되었는지 명확한 메시지와 함께 기동을 중단한다.
 */
const serverEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_URL: z.url().default('http://localhost:3000'),
  // fail-closed: 기본값 없음 — 미설정이면 DB 초기화는 명확하게 실패한다 (.env.example 참고)
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required. See .env.example.'),
  // 통합 테스트 전용 (선택) — 이름에 _test 필수, scripts/db-reset.ts가 검증
  TEST_DATABASE_URL: z.string().min(1).optional(),
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
