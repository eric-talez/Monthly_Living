/**
 * 통합 테스트 DB 준비 — TEST_DATABASE_URL 대상에 migration만 적용한다 (seed 없음).
 *
 *   pnpm db:test:prepare
 *
 * 안전 조건은 scripts/db-url-guard.ts 참고 (DB 이름 *_test 필수 등).
 * `prisma migrate deploy`는 shadow DB 없이 pending migration만 적용하므로
 * custom SQL(CHECK, NULLS NOT DISTINCT 등)이 그대로 보존된다.
 */
import { spawnSync } from 'node:child_process';

import { config as loadDotenv } from 'dotenv';

import { assertSafeLocalDbUrl } from './db-url-guard';

loadDotenv({ path: ['.env.local', '.env'], quiet: true });

const { url, host, port, database } = assertSafeLocalDbUrl(
  'test',
  'TEST_DATABASE_URL',
  process.env.TEST_DATABASE_URL,
);

console.log(`[db-test-prepare] host=${host} port=${port} database=${database}`);

const result = spawnSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL: url },
});

process.exit(result.status ?? 1);
