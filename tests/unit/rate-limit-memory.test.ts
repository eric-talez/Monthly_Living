import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createMemoryRateLimiter } from '@/adapters/rate-limit/memory';

// globalThis 레지스트리 공유를 피하기 위해 테스트마다 고유 name을 사용한다
let counter = 0;
function makeLimiter(max: number, windowMs: number) {
  counter += 1;
  return createMemoryRateLimiter({ name: `test:${Date.now()}:${counter}`, max, windowMs });
}

describe('createMemoryRateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('max회까지 허용하고 remaining을 줄인다', async () => {
    const limiter = makeLimiter(3, 60_000);
    await expect(limiter.limit('k')).resolves.toMatchObject({ allowed: true, remaining: 2 });
    await expect(limiter.limit('k')).resolves.toMatchObject({ allowed: true, remaining: 1 });
    await expect(limiter.limit('k')).resolves.toMatchObject({ allowed: true, remaining: 0 });
  });

  it('max 초과 시 차단하고 retryAfterMs를 돌려준다', async () => {
    const limiter = makeLimiter(2, 60_000);
    await limiter.limit('k');
    vi.advanceTimersByTime(10_000);
    await limiter.limit('k');

    const decision = await limiter.limit('k');
    expect(decision.allowed).toBe(false);
    expect(decision.remaining).toBe(0);
    // 가장 오래된 기록(0ms 시점)이 만료되는 60초까지 남은 시간
    expect(decision.retryAfterMs).toBe(50_000);
  });

  it('window가 지나면 다시 허용한다 (sliding window)', async () => {
    const limiter = makeLimiter(1, 60_000);
    await expect(limiter.limit('k')).resolves.toMatchObject({ allowed: true });
    await expect(limiter.limit('k')).resolves.toMatchObject({ allowed: false });

    vi.advanceTimersByTime(60_001);
    await expect(limiter.limit('k')).resolves.toMatchObject({ allowed: true });
  });

  it('키가 다르면 서로 격리된다', async () => {
    const limiter = makeLimiter(1, 60_000);
    await expect(limiter.limit('a')).resolves.toMatchObject({ allowed: true });
    await expect(limiter.limit('a')).resolves.toMatchObject({ allowed: false });
    await expect(limiter.limit('b')).resolves.toMatchObject({ allowed: true });
  });

  it('같은 name은 같은 저장소를 공유한다 (HMR에서 카운터 유지)', async () => {
    const name = `test:shared:${Date.now()}`;
    const first = createMemoryRateLimiter({ name, max: 1, windowMs: 60_000 });
    await first.limit('k');

    const second = createMemoryRateLimiter({ name, max: 1, windowMs: 60_000 });
    await expect(second.limit('k')).resolves.toMatchObject({ allowed: false });
  });

  it('clear()는 모든 기록을 비운다 (테스트 전용)', async () => {
    const limiter = makeLimiter(1, 60_000);
    await limiter.limit('k');
    limiter.clear();
    await expect(limiter.limit('k')).resolves.toMatchObject({ allowed: true });
  });
});
