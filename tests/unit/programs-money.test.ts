import { describe, expect, it } from 'vitest';

import type { Currency } from '@/generated/prisma/client';
import { formatMoney, minorToMajor } from '@/modules/programs/money';

describe('minorToMajor — 통화별 minor-unit 지수', () => {
  it('0-decimal 통화(KRW/VND)는 값 그대로', () => {
    expect(minorToMajor(350_000, 'KRW')).toBe(350_000);
    expect(minorToMajor(6_000_000, 'VND')).toBe(6_000_000);
  });

  it('2-decimal 통화(THB/USD)는 100으로 나눈다', () => {
    expect(minorToMajor(900_000, 'THB')).toBe(9_000); // 900,000 satang = 9,000 THB
    expect(minorToMajor(50_000, 'USD')).toBe(500);
  });

  it('0은 모든 통화에서 0', () => {
    expect(minorToMajor(0, 'KRW')).toBe(0);
    expect(minorToMajor(0, 'THB')).toBe(0);
  });

  it('Prisma Int 범위의 큰 값도 정확히 변환한다', () => {
    expect(minorToMajor(2_000_000_000, 'KRW')).toBe(2_000_000_000);
    expect(minorToMajor(2_000_000_000, 'THB')).toBe(20_000_000);
  });

  it('음수·비정수·미지원 통화는 fail-closed(throw)', () => {
    expect(() => minorToMajor(-1, 'KRW')).toThrow();
    expect(() => minorToMajor(1.5, 'KRW')).toThrow();
    expect(() => minorToMajor(1000, 'EUR' as Currency)).toThrow();
  });
});

describe('formatMoney — Intl 통화 포맷(심볼 하드코딩 없음)', () => {
  it('KRW는 소수 없이 그룹 구분한다', () => {
    const formatted = formatMoney(350_000, 'KRW', 'ko');
    expect(formatted).toMatch(/350,000/);
  });

  it('THB는 major 단위로 환산해 포맷한다', () => {
    const formatted = formatMoney(900_000, 'THB', 'en');
    expect(formatted).toMatch(/9,000/);
  });

  it('USD도 major 단위로 환산한다', () => {
    const formatted = formatMoney(50_000, 'USD', 'en');
    expect(formatted).toMatch(/500/);
    expect(formatted).not.toMatch(/50,000/);
  });
});
