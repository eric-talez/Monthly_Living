/**
 * 안전장치가 있는 DB reset 스크립트 — `prisma migrate reset`은 반드시 이 스크립트를 통해 실행한다.
 *
 *   pnpm db:reset        → DATABASE_URL 대상 (DB 이름: handalsalgi_dev 또는 *_dev)
 *   pnpm db:reset:test   → TEST_DATABASE_URL 대상 (DB 이름: *_test 필수)
 *
 * 안전 조건은 scripts/db-url-guard.ts 참고 (production/비 localhost/시스템 DB/
 * 이름 규칙 위반/schema!=public/파싱 실패 → 즉시 거부).
 *
 * 참고: Prisma 7.8 실측 결과 `migrate reset`은 generate/seed를 자동 실행하지 않는다
 * (2026-07-12, PROGRESS.md 1B-2B 기록). 따라서 dev 대상에 한해 reset 성공 후
 * `prisma db seed`를 명시적으로 1회 실행한다. test 대상은 빈 스키마를 유지한다
 * (통합 테스트는 자체 픽스처를 사용).
 */
import { spawnSync } from 'node:child_process';

import { config as loadDotenv } from 'dotenv';

import { assertSafeLocalDbUrl, refuse } from './db-url-guard';

loadDotenv({ path: ['.env.local', '.env'], quiet: true });

const args = process.argv.slice(2);
const target = args.includes('--test') ? 'test' : args.includes('--dev') ? 'dev' : null;
if (!target) {
  refuse('대상 미지정 — --dev 또는 --test 플래그가 필요합니다');
}

const envVarName = target === 'test' ? 'TEST_DATABASE_URL' : 'DATABASE_URL';
const { url, host, port, database } = assertSafeLocalDbUrl(
  target,
  envVarName,
  process.env[envVarName],
);

// 실행 전 대상 출력 — 비밀번호는 출력하지 않는다
console.log(`[db-reset] target=${target} host=${host} port=${port} database=${database}`);

const reset = spawnSync('pnpm', ['exec', 'prisma', 'migrate', 'reset', '--force'], {
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL: url },
});

if (reset.status !== 0) {
  process.exit(reset.status ?? 1);
}

// dev 왕복 완성: reset 후 seed 재적용 (test DB는 빈 스키마 유지)
if (target === 'dev') {
  const seed = spawnSync('pnpm', ['exec', 'prisma', 'db', 'seed'], {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: url },
  });
  process.exit(seed.status ?? 1);
}

process.exit(0);
