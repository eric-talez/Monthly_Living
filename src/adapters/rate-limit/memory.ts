import type { RateLimitConfig, RateLimitDecision, RateLimiter } from './types';

/**
 * Memory rate limiter — sliding window log (키별 timestamp 배열).
 *
 * MVP 한계 (docs/decisions/client-ip-and-rate-limit.md):
 * - 프로세스별 상태다. 다중 인스턴스 production에서는 인스턴스 수만큼 한도가
 *   늘어나므로 같은 port의 Redis 구현으로 교체해야 한다 (README 출시 Gate).
 * - 프로세스 재시작 시 카운터가 초기화된다.
 *
 * 정리는 setInterval 없이 수행한다 (dev HMR로 모듈이 재평가될 때 타이머가
 * 중복 생성되는 문제 회피): 접근한 키는 그때 prune하고, 키 수가 임계치를
 * 넘으면 전체 sweep으로 만료 키를 제거한다.
 */
export interface MemoryRateLimiter extends RateLimiter {
  /** 테스트 전용 — 이 limiter의 모든 기록을 비운다. */
  clear(): void;
}

interface MemoryRateLimiterOptions extends RateLimitConfig {
  /** globalThis 레지스트리 키 — HMR/모듈 재평가에도 같은 저장소를 재사용한다. */
  name: string;
}

const SWEEP_KEY_THRESHOLD = 10_000;

// dev 핫리로드에서 카운터가 초기화되지 않도록 저장소를 globalThis에 둔다 (lib/prisma.ts와 같은 패턴)
const globalRegistry = globalThis as unknown as {
  __memoryRateLimitStores?: Map<string, Map<string, number[]>>;
};

function getStore(name: string): Map<string, number[]> {
  globalRegistry.__memoryRateLimitStores ??= new Map();
  let store = globalRegistry.__memoryRateLimitStores.get(name);
  if (!store) {
    store = new Map();
    globalRegistry.__memoryRateLimitStores.set(name, store);
  }
  return store;
}

export function createMemoryRateLimiter(options: MemoryRateLimiterOptions): MemoryRateLimiter {
  const { name, max, windowMs } = options;
  const store = getStore(name);

  function sweep(now: number): void {
    for (const [key, timestamps] of store) {
      const alive = timestamps.filter((t) => t > now - windowMs);
      if (alive.length === 0) {
        store.delete(key);
      } else if (alive.length !== timestamps.length) {
        store.set(key, alive);
      }
    }
  }

  return {
    async limit(key: string): Promise<RateLimitDecision> {
      const now = Date.now();

      if (store.size > SWEEP_KEY_THRESHOLD) {
        sweep(now);
      }

      const alive = (store.get(key) ?? []).filter((t) => t > now - windowMs);

      if (alive.length >= max) {
        store.set(key, alive);
        // window log이므로 가장 오래된 기록이 만료되는 시점이 다음 허용 시점이다
        const oldest = alive[0];
        return { allowed: false, remaining: 0, retryAfterMs: Math.max(oldest + windowMs - now, 0) };
      }

      alive.push(now);
      store.set(key, alive);
      return { allowed: true, remaining: max - alive.length, retryAfterMs: 0 };
    },

    clear(): void {
      store.clear();
    },
  };
}
