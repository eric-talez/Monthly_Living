import type { Currency } from '@/generated/prisma/client';

/**
 * 금액 변환·표시 — 순수 모듈(unit 테스트 가능).
 * 스키마상 모든 금액은 정수 minor units다(`Program.basePrice Int // minor units`).
 * ISO 4217 minor-unit 지수: KRW/VND는 0(표시=값), THB/USD는 2.
 * `minorToMajor`(순수 산술)와 `formatMoney`(locale-aware 포맷)를 분리한다.
 */
export const CURRENCY_MINOR_UNIT_EXPONENT: Record<Currency, number> = {
  KRW: 0,
  VND: 0,
  THB: 2,
  USD: 2,
};

/**
 * minor units → major 단위. 예: 900000 satang → 9000(THB), 350000 → 350000(KRW).
 * 미지원 통화·비정수·음수·비유한 값은 fail-closed로 throw한다(스키마 CHECK가 정상값 보장).
 */
export function minorToMajor(amount: number, currency: Currency): number {
  const exponent = CURRENCY_MINOR_UNIT_EXPONENT[currency];
  if (exponent === undefined) {
    throw new Error(`Unsupported currency: ${String(currency)}`);
  }
  if (!Number.isInteger(amount) || amount < 0) {
    throw new Error(`Invalid minor amount: ${String(amount)}`);
  }
  return exponent === 0 ? amount : amount / 10 ** exponent;
}

/** 통화 기호를 하드코딩하지 않고 Intl로 포맷한다. `amountMinor`는 정수 minor units. */
export function formatMoney(amountMinor: number, currency: Currency, locale: string): string {
  const exponent = CURRENCY_MINOR_UNIT_EXPONENT[currency];
  const major = minorToMajor(amountMinor, currency);
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: exponent,
  }).format(major);
}
