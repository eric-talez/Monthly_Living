import { config as loadDotenv } from 'dotenv';

import { assertSafeLocalDbUrl } from '../../scripts/db-url-guard';

/**
 * 통합 테스트 환경 준비 — 테스트 파일 import 전에 실행된다 (vitest setupFiles).
 *
 * 안전장치 (이중):
 * 1. TEST_DATABASE_URL 미설정이면 명확한 안내와 함께 즉시 실패한다 (조용한 skip 금지).
 * 2. 기존 가드(assertSafeLocalDbUrl)로 localhost + `*_test` 이름을 강제한 뒤
 *    DATABASE_URL 자체를 TEST_DATABASE_URL로 덮어쓴다 — 실수로 싱글턴 prisma
 *    (기본 deps)를 타더라도 test DB 밖으로는 나갈 수 없다.
 * dev DB에 대한 reset/삭제는 어떤 경로로도 수행하지 않는다.
 */
loadDotenv({ path: ['.env.local', '.env'], quiet: true });

const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl) {
  throw new Error(
    [
      '[integration] TEST_DATABASE_URL이 설정되어 있지 않습니다.',
      '통합 테스트는 전용 test DB에서만 실행됩니다:',
      '  1) .env.local에 TEST_DATABASE_URL 설정 (.env.example 참고)',
      '  2) pnpm db:test:prepare  (test DB에 migration 적용)',
      '  3) pnpm test:integration',
    ].join('\n'),
  );
}

assertSafeLocalDbUrl('test', 'TEST_DATABASE_URL', testUrl);

process.env.DATABASE_URL = testUrl;
process.env.AUTH_SECRET ??= 'vitest-integration-only-fake-auth-secret-0123456789';

// OAuth 통합 테스트용 가짜 credential — ??= 가 아니라 무조건 대입한다:
// .env.local의 실제 credential이 테스트 기대값(fake network의 aud 검증 등)으로
// 새어 들어오면 테스트가 환경 의존적이 된다. 실제 provider 네트워크는
// helpers/oauth.ts의 fake fetch가 전부 대체하므로 이 값은 밖으로 나가지 않는다.
process.env.AUTH_GOOGLE_ID = 'vitest-google-client-id';
process.env.AUTH_GOOGLE_SECRET = 'vitest-google-client-secret';
process.env.AUTH_KAKAO_ID = 'vitest-kakao-client-id';
process.env.AUTH_KAKAO_SECRET = 'vitest-kakao-client-secret';
