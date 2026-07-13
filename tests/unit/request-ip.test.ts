import { describe, expect, it } from 'vitest';

import { getClientIp, UNKNOWN_IP } from '@/lib/request-ip';

describe('getClientIp', () => {
  it('x-forwarded-for 단일 값을 돌려준다', () => {
    const headers = new Headers({ 'x-forwarded-for': '203.0.113.7' });
    expect(getClientIp(headers)).toBe('203.0.113.7');
  });

  it('다중 값이면 leftmost를 trim해 돌려준다 (정책 문서 참고)', () => {
    const headers = new Headers({ 'x-forwarded-for': ' 203.0.113.7 , 10.0.0.1, 172.16.0.1' });
    expect(getClientIp(headers)).toBe('203.0.113.7');
  });

  it('헤더가 없으면 unknown', () => {
    expect(getClientIp(new Headers())).toBe(UNKNOWN_IP);
  });

  it('빈 값이면 unknown', () => {
    expect(getClientIp(new Headers({ 'x-forwarded-for': '  ' }))).toBe(UNKNOWN_IP);
  });
});
