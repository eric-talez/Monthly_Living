import { describe, expect, it } from 'vitest';

import {
  credentialVersionDigest,
  generateRawToken,
  hashRateLimitKey,
  hashToken,
} from '@/modules/auth/tokens';

describe('generateRawToken', () => {
  it('256-bit entropy의 base64url 토큰을 생성한다 (32바이트 → 43자)', () => {
    const token = generateRawToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('호출마다 다른 값을 생성한다', () => {
    expect(generateRawToken()).not.toBe(generateRawToken());
  });
});

describe('hashToken', () => {
  it('sha256 hex를 돌려주고 원문과 다르다', () => {
    const raw = generateRawToken();
    const hashed = hashToken(raw);
    expect(hashed).toMatch(/^[0-9a-f]{64}$/);
    expect(hashed).not.toBe(raw);
    expect(hashed).not.toContain(raw);
  });

  it('결정적이다 — 같은 원문은 같은 hash', () => {
    expect(hashToken('fixed-token')).toBe(hashToken('fixed-token'));
  });
});

describe('hashRateLimitKey', () => {
  it('같은 secret+값은 같은 키, secret이 다르면 다른 키', () => {
    expect(hashRateLimitKey('s1', 'user@example.com')).toBe(
      hashRateLimitKey('s1', 'user@example.com'),
    );
    expect(hashRateLimitKey('s1', 'user@example.com')).not.toBe(
      hashRateLimitKey('s2', 'user@example.com'),
    );
  });

  it('raw 값을 포함하지 않는 hex를 돌려준다', () => {
    const key = hashRateLimitKey('secret', 'user@example.com');
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(key).not.toContain('user@example.com');
  });
});

describe('credentialVersionDigest', () => {
  it('passwordHash가 바뀌면 digest도 바뀐다 (재설정 시 세션 무효화 근거)', () => {
    const before = credentialVersionDigest('secret', '$2b$12$hash-before');
    const after = credentialVersionDigest('secret', '$2b$12$hash-after');
    expect(before).not.toBe(after);
    expect(before).toMatch(/^[0-9a-f]{64}$/);
  });

  it('raw passwordHash를 포함하지 않는다', () => {
    const digest = credentialVersionDigest('secret', '$2b$12$somehashvalue');
    expect(digest).not.toContain('$2b$12$');
  });
});
