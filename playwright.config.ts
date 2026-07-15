import { config as loadDotenv } from 'dotenv';
import { defineConfig, devices } from '@playwright/test';

// Playwright는 .env.local을 자동 로드하지 않는다 — config·worker가 E2E_DATABASE_URL/AUTH_SECRET을
// 보도록 여기서 로드한다. 이미 설정된 env는 덮지 않는다(CI의 job env가 우선).
loadDotenv({ path: ['.env.local', '.env'], quiet: true });

// run-scoped 격리: 이 run의 fixture만 정리하도록 고유 runId를 "1회" 고정한다.
// `??=`라 worker가 config를 재평가해도 부모(main)에서 상속한 값을 유지한다(재생성 없음).
// 전파 방식은 process.env 상속(main→worker→globalTeardown) — 구현 후 실측 검증한다.
process.env.E2E_RUN_ID ??= `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

const PORT = 3100;
const BASE_URL = `http://localhost:${PORT}`;
const isCI = !!process.env.CI;

const E2E_DATABASE_URL = process.env.E2E_DATABASE_URL;
if (!E2E_DATABASE_URL) {
  throw new Error(
    'E2E_DATABASE_URL이 설정되지 않았습니다. .env.local에 로컬 E2E DB(handalsalgi_e2e_test)를 지정하거나 CI env를 확인하세요.',
  );
}

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1, // in-memory rate limiter는 서버 프로세스별이고 DB는 공유 — 직렬 실행이 결정적
  forbidOnly: isCI,
  retries: isCI ? 1 : 0, // 2는 loginByEmail(5/15min)/loginByIp(20/15min) 초과 위험
  timeout: 30_000,
  expect: { timeout: 7_000 }, // next-intl/RSC redirect + React tick을 재시도 assertion으로 흡수
  reporter: isCI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  globalSetup: './tests/e2e/global-setup.ts',
  globalTeardown: './tests/e2e/global-teardown.ts',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // production next start만 사용한다 — 실패 시 dev server로 fallback하지 않는다.
    // 로컬은 한 번에 build+start, CI는 build를 별도 step으로 분리하고 여기선 start만.
    command: isCI ? `pnpm start -p ${PORT}` : `pnpm build && pnpm start -p ${PORT}`,
    url: BASE_URL,
    timeout: 180_000,
    reuseExistingServer: !isCI,
    env: {
      // 앱은 DATABASE_URL을 읽는다. guarded E2E URL을 그대로 전달(E2E_DATABASE_URL은 tooling-only).
      DATABASE_URL: E2E_DATABASE_URL,
      // next start는 NODE_ENV=production을 강제한다. AUTH_URL=http://…가 세션 쿠키를 비-Secure
      // (authjs.session-token)로 만들어 http localhost에서 Playwright가 보유할 수 있게 한다.
      AUTH_URL: BASE_URL,
      AUTH_TRUST_HOST: 'true',
      APP_URL: BASE_URL,
      AUTH_SECRET: process.env.AUTH_SECRET ?? 'e2e-only-not-a-real-secret-000000000000',
      EMAIL_PROVIDER: 'console',
      NEXT_TELEMETRY_DISABLED: '1',
      // OAuth env는 설정하지 않는다 → Google/Kakao 비활성, Credentials만 로드.
    },
  },
});
