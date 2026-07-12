import { z } from 'zod';

/**
 * 서버 환경변수 스키마.
 * 새 환경변수는 반드시 여기에 추가하고 .env.example에도 함께 기록한다.
 * 검증 실패 시 어떤 변수가 왜 잘못되었는지 명확한 메시지와 함께 기동을 중단한다.
 */
const serverEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_URL: z.url().default('http://localhost:3000'),
  // 미설정 시 로컬 dev DB 기본값 (prisma.config.ts와 동일). production은 배포 환경변수로 명시한다.
  DATABASE_URL: z.string().min(1).default('postgresql://localhost:5432/handalsalgi_dev'),
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
