/**
 * 파괴적/적용성 DB 명령(reset, test deploy) 공용 안전장치.
 * 하나라도 걸리면 이유를 출력하고 프로세스를 종료한다.
 * 로그에는 host/port/database만 출력한다 — username·password 등 secret은 출력하지 않는다.
 */
export interface GuardedDbTarget {
  url: string;
  host: string;
  port: string;
  database: string;
}

const SYSTEM_DATABASES = new Set(['postgres', 'template0', 'template1']);
const ALLOWED_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

export function refuse(reason: string): never {
  console.error(`[db-guard] 거부: ${reason}`);
  process.exit(1);
}

export function assertSafeLocalDbUrl(
  target: 'dev' | 'test',
  envVarName: string,
  rawUrl: string | undefined,
): GuardedDbTarget {
  // 안전 조건 1: production 환경에서는 어떤 대상이든 거부
  if (process.env.NODE_ENV === 'production') {
    refuse('NODE_ENV=production에서는 실행할 수 없습니다');
  }

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
    refuse(`허용되지 않은 host "${host}" — localhost/127.0.0.1/::1만 허용합니다`);
  }

  if (!database) {
    refuse('URL에 database 이름이 없습니다');
  }

  // 안전 조건 4: 시스템 DB는 항상 거부
  if (SYSTEM_DATABASES.has(database.toLowerCase())) {
    refuse(`시스템 DB "${database}"에는 실행할 수 없습니다`);
  }

  // 안전 조건 5: 대상별 DB 이름 규칙
  if (target === 'dev' && database !== 'handalsalgi_dev' && !database.endsWith('_dev')) {
    refuse(`dev 대상 DB 이름("${database}")은 handalsalgi_dev이거나 _dev로 끝나야 합니다`);
  }
  if (target === 'test' && !database.endsWith('_test')) {
    refuse(`test 대상 DB 이름("${database}")은 _test로 끝나야 합니다`);
  }

  // 안전 조건 6: schema 파라미터는 public만 허용
  const schemaParam = parsed.searchParams.get('schema');
  if (schemaParam !== null && schemaParam !== 'public') {
    refuse(`허용되지 않은 schema "${schemaParam}" — public만 허용합니다`);
  }

  return { url: rawUrl, host, port, database };
}
