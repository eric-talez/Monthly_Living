import { E2E_RUN_ID, cleanupRun, createE2ePrisma } from './helpers/db';

/**
 * 안전망 정리 — "이 run(E2E_RUN_ID)의 prefix" 데이터만 삭제한다.
 * fixture teardown이 각 test 데이터를 이미 지우지만, 하드 크래시로 누락된 경우를 대비한다.
 * 절대 `@e2e.test` 전체를 지우지 않는다 — 동시에 실행 중인 다른 로컬 run의 fixture와
 * seed 계정(@test.com)을 보존해야 한다. runId는 global-setup과 동일해야 한다(전파 검증).
 */
export default async function globalTeardown(): Promise<void> {
  console.log(`[e2e] global-teardown runId=${E2E_RUN_ID}`);
  const prisma = createE2ePrisma();
  try {
    await cleanupRun(prisma, E2E_RUN_ID);
  } finally {
    await prisma.$disconnect();
  }
}
