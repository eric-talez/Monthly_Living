/**
 * Rate limit port — 구현체(memory/redis)는 이 인터페이스 뒤에 숨긴다.
 * MVP는 memory, production은 Redis 전환 (README 출시 Gate).
 */
export interface RateLimitConfig {
  /** window 안에서 허용되는 최대 횟수 */
  max: number;
  /** sliding window 길이 (ms) */
  windowMs: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  /** 이번 결정 이후 window 안에 남은 허용 횟수 */
  remaining: number;
  /** allowed=false일 때 재시도까지 남은 시간(ms), allowed=true면 0 */
  retryAfterMs: number;
}

export interface RateLimiter {
  /** key 기준으로 1회 시도를 기록하고 허용 여부를 돌려준다. */
  limit(key: string): Promise<RateLimitDecision>;
}
