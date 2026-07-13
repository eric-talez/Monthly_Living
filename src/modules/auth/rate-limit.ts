import { createMemoryRateLimiter } from '@/adapters/rate-limit/memory';
import type { RateLimiter } from '@/adapters/rate-limit/types';

import { AUTH_RATE_LIMITS, type AuthRateLimitName } from './constants';

/**
 * 인증 흐름별 명명된 rate limiter 세트 (순수 팩토리 — env import 금지).
 * LoginAttempt는 감사 기록, limiter는 제어 장치로 역할이 다르다
 * (docs/decisions/client-ip-and-rate-limit.md).
 */
export type AuthRateLimiters = Record<AuthRateLimitName, RateLimiter>;

export function createMemoryAuthRateLimiters(): AuthRateLimiters {
  const entries = (Object.keys(AUTH_RATE_LIMITS) as AuthRateLimitName[]).map((name) => [
    name,
    createMemoryRateLimiter({ name: `auth:${name}`, ...AUTH_RATE_LIMITS[name] }),
  ]);
  return Object.fromEntries(entries) as AuthRateLimiters;
}
