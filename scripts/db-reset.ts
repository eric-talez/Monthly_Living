/**
 * 안전장치가 있는 DB reset 스크립트 — `prisma migrate reset`은 반드시 이 스크립트를 통해 실행한다.
 *
 *   pnpm db:reset        → DATABASE_URL 대상 (DB 이름: handalsalgi_dev 또는 *_dev)
 *   pnpm db:reset:test   → TEST_DATABASE_URL 대상 (DB 이름: *_test 필수)
 *
 * 안전 조건 (하나라도 걸리면 즉시 거부):
 *   - NODE_ENV=production
 *   - URL 파싱 실패
 *   - host가 localhost/127.0.0.1/::1이 아님
 *   - 시스템 DB(postgres, template0, template1)
 *   - --dev 대상인데 DB 이름이 handalsalgi_dev도 아니고 _dev suffix도 아님
 *   - --test 대상인데 DB 이름이 _test suffix가 아님
 *   - ?schema= 파라미터가 public 이외
 *
 * 로그에는 host/port/database만 출력한다 — username·password 등 secret은 출력하지 않는다.
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

const SYSTEM_DATABASES = new Set(['postgres', 'template0', 'template1']);
const ALLOWED_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

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
if (!ALLOWED_HOSTS.has(host)) {
  refuse(`허용되지 않은 host "${host}" — localhost/127.0.0.1/::1만 reset 가능합니다`);
}

if (!database) {
  refuse('URL에 database 이름이 없습니다');
}

// 안전 조건 4: 시스템 DB는 항상 거부
if (SYSTEM_DATABASES.has(database.toLowerCase())) {
  refuse(`시스템 DB "${database}"는 reset할 수 없습니다`);
}

// 안전 조건 5: 대상별 DB 이름 규칙
if (target === 'dev' && database !== 'handalsalgi_dev' && !database.endsWith('_dev')) {
  refuse(`dev reset 대상 DB 이름("${database}")은 handalsalgi_dev이거나 _dev로 끝나야 합니다`);
}
if (target === 'test' && !database.endsWith('_test')) {
  refuse(`test reset 대상 DB 이름("${database}")은 _test로 끝나야 합니다`);
}

// 안전 조건 6: schema 파라미터는 public만 허용
const schemaParam = parsed.searchParams.get('schema');
if (schemaParam !== null && schemaParam !== 'public') {
  refuse(`허용되지 않은 schema "${schemaParam}" — public만 허용합니다`);
}

// 실행 전 대상 출력 — username·password 등 secret은 출력하지 않는다
console.log(`[db-reset] target=${target} host=${host} port=${port} database=${database}`);

const result = spawnSync('pnpm', ['exec', 'prisma', 'migrate', 'reset', '--force'], {
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL: rawUrl },
});

process.exit(result.status ?? 1);
