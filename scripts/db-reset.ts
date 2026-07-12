/**
 * 안전장치가 있는 DB reset 스크립트 — `prisma migrate reset`은 반드시 이 스크립트를 통해 실행한다.
 *
 *   pnpm db:reset        → DATABASE_URL 대상 (로컬 dev DB)
 *   pnpm db:reset:test   → TEST_DATABASE_URL 대상 (이름에 _test 필수)
 *
 * 참고: Prisma 7의 `migrate reset`은 generator와 seed를 자동 실행하므로
 * 이 스크립트는 generate/seed를 중복 호출하지 않는다.
 */
import { spawnSync } from 'node:child_process';

import { config as loadDotenv } from 'dotenv';

loadDotenv({ path: ['.env.local', '.env'], quiet: true });

function refuse(reason: string): never {
  console.error(`[db-reset] 거부: ${reason}`);
  process.exit(1);
}

const args = process.argv.slice(2);
const target = args.includes('--test') ? 'test' : args.includes('--dev') ? 'dev' : null;
if (!target) {
  refuse('대상 미지정 — --dev 또는 --test 플래그가 필요합니다');
}

// 안전 조건 1: production 환경에서는 어떤 대상이든 거부
if (process.env.NODE_ENV === 'production') {
  refuse('NODE_ENV=production에서는 reset을 실행할 수 없습니다');
}

const envVarName = target === 'test' ? 'TEST_DATABASE_URL' : 'DATABASE_URL';
const rawUrl = process.env[envVarName];
if (!rawUrl) {
  refuse(`${envVarName}이(가) 설정되어 있지 않습니다 (.env.example 참고)`);
}

// 안전 조건 2: URL 파싱 실패 시 거부
let parsed: URL;
try {
  parsed = new URL(rawUrl);
} catch {
  refuse(`${envVarName} 파싱 실패 — postgresql://HOST:PORT/DBNAME 형식이어야 합니다`);
}

const host = parsed.hostname;
const port = parsed.port || '5432';
const database = parsed.pathname.replace(/^\//, '');

// 안전 조건 3: localhost 계열이 아니면 거부 (production/staging host 차단)
if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
  refuse(`허용되지 않은 host "${host}" — localhost/127.0.0.1만 reset 가능합니다`);
}

// 안전 조건 4: test 대상인데 DB 이름에 _test가 없으면 거부
if (target === 'test' && !database.includes('_test')) {
  refuse(`test reset 대상 DB 이름("${database}")에 _test가 없습니다`);
}

if (!database) {
  refuse('URL에 database 이름이 없습니다');
}

// 실행 전 대상 출력 — 비밀번호는 출력하지 않는다
console.log(`[db-reset] target=${target} host=${host} port=${port} database=${database}`);

const result = spawnSync('pnpm', ['exec', 'prisma', 'migrate', 'reset', '--force'], {
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL: rawUrl },
});

process.exit(result.status ?? 1);
