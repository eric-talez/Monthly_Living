import { test as base } from '@playwright/test';
import bcrypt from 'bcryptjs';

import type { PrismaClient } from '../../src/generated/prisma/client';
import { E2E_RUN_ID, createE2ePrisma, e2eEmail } from './helpers/db';

// seed·runtime과 동일한 cost 12 (src/modules/auth/constants.ts BCRYPT_COST)로 해시해야
// Credentials 로그인이 통과한다.
const TEST_PASSWORD = 'Test1234!';

interface WorkerFixtures {
  db: PrismaClient;
}
interface TestFixtures {
  incompleteTraveler: { email: string; password: string };
}

export const test = base.extend<TestFixtures, WorkerFixtures>({
  // worker-scoped client — worker당 1개, worker 종료 시 명시적 disconnect (연결 누수/hang 방지).
  // 두 번째 인자는 Playwright fixture provide 콜백(관례상 `use`)이지만, eslint react-hooks
  // 규칙의 오탐을 피하려 `provide`로 명명한다 — 동작은 동일하다.
  db: [
    async ({}, provide) => {
      // worker 프로세스의 runId — global-setup/teardown(main)과 동일해야 run-scoped 격리가 성립.
      console.log(`[e2e] worker runId=${E2E_RUN_ID}`);
      const prisma = createE2ePrisma();
      await provide(prisma);
      await prisma.$disconnect();
    },
    { scope: 'worker' },
  ],

  // test-scoped 미완료 traveler — 고유 이메일로 생성, use 이후 teardown은 "그 정확한 이메일만"
  // 삭제한다. teardown은 test가 throw/timeout해도 실행되므로 각 retry가 fresh user를 얻는다.
  incompleteTraveler: async ({ db }, provide) => {
    const email = e2eEmail('incomplete');
    await db.user.create({
      data: {
        email,
        passwordHash: bcrypt.hashSync(TEST_PASSWORD, 12),
        emailVerified: new Date(),
        // role/status는 schema default(TRAVELER/ACTIVE). fullName·country 없음 + TravelerProfile
        // 미생성 → isTravelerOnboardingComplete=false → post-login이 /onboarding으로 보낸다.
      },
    });

    await provide({ email, password: TEST_PASSWORD });

    // 정확한 이메일만 정리 — deleteMany라 이미 삭제됐어도 no-op(P2025 없음). user는 cascade,
    // LoginAttempt는 FK가 없어 별도 삭제.
    await db.user.deleteMany({ where: { email } });
    await db.loginAttempt.deleteMany({ where: { email } });
  },
});

export { expect } from '@playwright/test';
