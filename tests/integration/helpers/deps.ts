import { createMemoryRateLimiter } from '@/adapters/rate-limit/memory';
import type { EmailMessage } from '@/adapters/email/types';
import { AUTH_RATE_LIMITS, type AuthRateLimitName } from '@/modules/auth/constants';
import type { AuthServiceDeps } from '@/modules/auth/deps';
import { hashPassword, verifyPassword } from '@/modules/auth/passwords';
import type { AuthRateLimiters } from '@/modules/auth/rate-limit';
import { generateRawToken } from '@/modules/auth/tokens';

import { runId, testPrisma } from './db';

/**
 * 테스트용 의존성 — capture email provider(콘솔 파싱 금지), 필요 시 고정 clock·
 * 결정적 token factory 주입. limiter는 호출마다 고유 name을 써서
 * globalThis 저장소가 테스트 간 공유되지 않게 한다.
 */
let depsSequence = 0;

function createIsolatedRateLimiters(
  overrides?: Partial<Record<AuthRateLimitName, number>>,
): AuthRateLimiters {
  depsSequence += 1;
  const prefix = `it:${runId}:${depsSequence}`;
  const entries = (Object.keys(AUTH_RATE_LIMITS) as AuthRateLimitName[]).map((name) => [
    name,
    createMemoryRateLimiter({
      name: `${prefix}:${name}`,
      max: overrides?.[name] ?? AUTH_RATE_LIMITS[name].max,
      windowMs: AUTH_RATE_LIMITS[name].windowMs,
    }),
  ]);
  return Object.fromEntries(entries) as AuthRateLimiters;
}

export interface TestDeps {
  deps: AuthServiceDeps;
  /** capture email provider가 기록한 발송 내역 */
  sentEmails: EmailMessage[];
}

export function createTestDeps(
  overrides?: Partial<Omit<AuthServiceDeps, 'rateLimiters'>> & {
    /** limiter max 개별 조정 (예: 발동 테스트) */
    limiterMax?: Partial<Record<AuthRateLimitName, number>>;
  },
): TestDeps {
  const sentEmails: EmailMessage[] = [];
  const { limiterMax, ...depOverrides } = overrides ?? {};

  const deps: AuthServiceDeps = {
    db: testPrisma,
    emailProvider: {
      send: async (message) => {
        sentEmails.push(message);
      },
    },
    rateLimiters: createIsolatedRateLimiters(limiterMax),
    now: () => new Date(),
    generateToken: generateRawToken,
    // 실제 bcrypt 구현이 기본값 — "bcrypt 미호출" 테스트는 카운팅 래퍼를 override로 주입한다
    hashPassword,
    verifyPassword,
    ...depOverrides,
  };

  return { deps, sentEmails };
}

/** 이메일 본문에서 인증/재설정 URL의 token 쿼리 값을 추출한다 */
export function extractTokenFromEmail(message: EmailMessage): string {
  const match = message.text.match(/[?&]token=([A-Za-z0-9_-]+)/);
  if (!match) {
    throw new Error('이메일 본문에서 token을 찾지 못했습니다');
  }
  return match[1];
}
