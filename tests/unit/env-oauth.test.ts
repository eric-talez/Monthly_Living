import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * OAuth env fail-closed 매트릭스 — env 모듈은 import 시점에 검증하므로
 * 케이스마다 vi.resetModules + 동적 import로 새로 로드한다.
 * (unit 프로젝트는 dotenv를 로드하지 않는다 — 필수 기반 env는 직접 설정)
 */

const BASE_ENV = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://localhost:5432/handalsalgi_test',
  AUTH_SECRET: 'unit-test-only-secret-0123456789-0123456789',
} as const;

const OAUTH_KEYS = [
  'AUTH_GOOGLE_ID',
  'AUTH_GOOGLE_SECRET',
  'AUTH_KAKAO_ID',
  'AUTH_KAKAO_SECRET',
] as const;

let originalEnv: NodeJS.ProcessEnv;

beforeEach(() => {
  originalEnv = process.env;
  process.env = { ...originalEnv, ...BASE_ENV };
  for (const key of OAUTH_KEYS) {
    delete process.env[key];
  }
  vi.resetModules();
});

afterEach(() => {
  process.env = originalEnv;
});

async function loadEnv() {
  const module_ = await import('@/lib/env');
  return module_.env;
}

describe('OAuth provider env (fail-closed)', () => {
  it('전부 미설정이면 정상 기동하고 값은 undefined다 (provider 비활성)', async () => {
    const env = await loadEnv();
    expect(env.AUTH_GOOGLE_ID).toBeUndefined();
    expect(env.AUTH_GOOGLE_SECRET).toBeUndefined();
    expect(env.AUTH_KAKAO_ID).toBeUndefined();
    expect(env.AUTH_KAKAO_SECRET).toBeUndefined();
  });

  it('쌍이 모두 설정되면 trim된 값이 노출된다', async () => {
    process.env.AUTH_GOOGLE_ID = '  google-id  ';
    process.env.AUTH_GOOGLE_SECRET = 'google-secret';
    process.env.AUTH_KAKAO_ID = 'kakao-id';
    process.env.AUTH_KAKAO_SECRET = ' kakao-secret ';

    const env = await loadEnv();
    expect(env.AUTH_GOOGLE_ID).toBe('google-id');
    expect(env.AUTH_GOOGLE_SECRET).toBe('google-secret');
    expect(env.AUTH_KAKAO_ID).toBe('kakao-id');
    expect(env.AUTH_KAKAO_SECRET).toBe('kakao-secret');
  });

  it.each([
    ['AUTH_GOOGLE_ID', 'AUTH_GOOGLE_SECRET'],
    ['AUTH_GOOGLE_SECRET', 'AUTH_GOOGLE_ID'],
    ['AUTH_KAKAO_ID', 'AUTH_KAKAO_SECRET'],
    ['AUTH_KAKAO_SECRET', 'AUTH_KAKAO_ID'],
  ])('%s만 설정된 부분 구성은 기동을 중단한다 (%s 안내 포함)', async (setKey, missingKey) => {
    process.env[setKey] = 'some-value';
    await expect(loadEnv()).rejects.toThrow(new RegExp(missingKey));
    await expect(loadEnv()).rejects.toThrow(/set both or neither|must be set together/);
  });

  it('빈 문자열은 미설정이 아니라 오류다', async () => {
    process.env.AUTH_GOOGLE_ID = '';
    process.env.AUTH_GOOGLE_SECRET = 'secret';
    await expect(loadEnv()).rejects.toThrow(/AUTH_GOOGLE_ID/);
  });

  it('공백만 있는 값도 오류다 (whitespace-only 거부)', async () => {
    process.env.AUTH_KAKAO_ID = '   ';
    process.env.AUTH_KAKAO_SECRET = 'secret';
    await expect(loadEnv()).rejects.toThrow(/whitespace-only/);
  });

  it('한 provider만 활성화할 수 있다 (google만 설정)', async () => {
    process.env.AUTH_GOOGLE_ID = 'google-id';
    process.env.AUTH_GOOGLE_SECRET = 'google-secret';

    const env = await loadEnv();
    expect(env.AUTH_GOOGLE_ID).toBe('google-id');
    expect(env.AUTH_KAKAO_ID).toBeUndefined();
  });
});
