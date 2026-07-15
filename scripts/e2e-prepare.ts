/**
 * E2E DB 준비 — E2E_DATABASE_URL 대상에 migration 적용 + idempotent seed.
 *
 *   pnpm e2e:prepare
 *
 * Playwright lifecycle 순서에 의존하지 않도록 test:e2e가 playwright 실행 "전에"
 * 이 스크립트를 명시적으로 완료시킨다(package.json: `pnpm e2e:prepare && playwright test`).
 * 안전 조건은 scripts/db-url-guard.ts 재사용 — DB 이름 *_test 필수, localhost, NODE_ENV≠production.
 * migrate deploy는 pending migration만 적용(reset 아님), seed는 upsert라 재실행 시 수렴.
 */
import { spawnSync } from 'node:child_process';

import { config as loadDotenv } from 'dotenv';

import { assertSafeLocalDbUrl } from './db-url-guard';

loadDotenv({ path: ['.env.local', '.env'], quiet: true });

const { url, host, port, database } = assertSafeLocalDbUrl(
  'test',
  'E2E_DATABASE_URL',
  process.env.E2E_DATABASE_URL,
);

console.log(`[e2e-prepare] host=${host} port=${port} database=${database}`);

/** guarded url을 DATABASE_URL로 덮어써 child prisma가 그 대상에만 쓰게 한다. */
function run(args: string[]): void {
  const result = spawnSync('pnpm', ['exec', ...args], {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: url },
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run(['prisma', 'migrate', 'deploy']);
run(['prisma', 'db', 'seed']);
process.exit(0);
