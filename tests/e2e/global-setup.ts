import { E2E_RUN_ID, createE2ePrisma } from './helpers/db';

/**
 * fail-fast 가드 — migrate/seed는 `pnpm e2e:prepare`가 (playwright 실행 전에) 담당한다.
 * 여기서는 seed가 실제로 적용됐는지만 확인해, prepare 없이 `playwright test`를 돌린 경우
 * 명확한 에러를 준다. runId는 전파 검증을 위해 로깅한다(worker·teardown과 동일해야 함).
 */
export default async function globalSetup(): Promise<void> {
  console.log(`[e2e] global-setup runId=${E2E_RUN_ID}`);
  const prisma = createE2ePrisma();
  try {
    const seeded = await prisma.user.findUnique({ where: { email: 'traveler@test.com' } });
    if (!seeded) {
      throw new Error(
        'E2E DB가 준비되지 않았습니다 — 먼저 `pnpm e2e:prepare`(migrate deploy + seed)를 실행하세요.',
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}
