import { PrismaPg } from '@prisma/adapter-pg';

// 상대경로 import — Playwright의 TS 로더는 tsconfig `@/*`(baseUrl 없음)를 불안정하게 해석한다.
import { PrismaClient } from '../../../src/generated/prisma/client';

/**
 * E2E 전용 Prisma 접근 — run-scoped 격리 규칙.
 *
 * - 연결은 항상 E2E_DATABASE_URL (guard 통과 DB `handalsalgi_e2e_test`).
 * - 모든 fixture 이메일은 `e2e-${E2E_RUN_ID}-…@e2e.test` 형태 → 이 run이 만든 데이터만
 *   정리한다(다른 로컬 run·seed `@test.com`은 절대 건드리지 않는다).
 * - 싱글턴이 아니라 팩토리다: setup/teardown/worker가 각자 client를 만들고 명시적으로 닫는다.
 */
export const E2E_RUN_ID = process.env.E2E_RUN_ID ?? 'norun';
export const E2E_EMAIL_DOMAIN = 'e2e.test';

/** 이 run의 이메일 prefix — teardown이 이 prefix로만 삭제한다. */
export function runEmailPrefix(runId: string): string {
  return `e2e-${runId}-`;
}

/** 이 run 고유의 fixture 이메일 (label + 무작위 suffix로 test별 유일성 보장). */
export function e2eEmail(label: string): string {
  return `${runEmailPrefix(E2E_RUN_ID)}${label}-${Math.random().toString(36).slice(2, 8)}@${E2E_EMAIL_DOMAIN}`.toLowerCase();
}

export function createE2ePrisma(): PrismaClient {
  const connectionString = process.env.E2E_DATABASE_URL;
  if (!connectionString) {
    throw new Error('E2E_DATABASE_URL이 설정되지 않았습니다.');
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

/**
 * 특정 run(runId)이 만든 데이터만 삭제한다 — 순수 함수라 회귀 검증에서 직접 호출한다.
 * user.deleteMany는 TravelerProfile/token/consent를 cascade, LoginAttempt는 FK가 없어 별도 삭제.
 */
export async function cleanupRun(prisma: PrismaClient, runId: string): Promise<void> {
  const where = { email: { startsWith: runEmailPrefix(runId) } };
  await prisma.user.deleteMany({ where });
  await prisma.loginAttempt.deleteMany({ where });
}
