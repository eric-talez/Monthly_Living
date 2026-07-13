// 참고 환율 스냅샷 (표시용 — 계약 금액과 무관, database-constraints.md §3).
// 고정 기준 시각의 mid-rate에서 파생한 12개 방향쌍. 갱신은 새 행 추가로만 한다(append-only).
export const RATE_AS_OF = new Date('2026-07-01T00:00:00Z');
export const RATE_SOURCE = 'manual-seed';

// 1 단위 기준 통화 → 상대 통화 (mid-rate, 2026-07-01 가정치)
const USD_MID = { KRW: 1385.0, THB: 36.4, VND: 25450.0 };

type Cur = 'KRW' | 'USD' | 'THB' | 'VND';

function cross(from: Cur, to: Cur): number {
  const toUsd = (c: Cur): number => (c === 'USD' ? 1 : 1 / USD_MID[c as keyof typeof USD_MID]);
  return toUsd(from) / toUsd(to);
}

const CURRENCIES: Cur[] = ['KRW', 'USD', 'THB', 'VND'];

export const exchangeRateSeeds = CURRENCIES.flatMap((base) =>
  CURRENCIES.filter((quote) => quote !== base).map((quote) => ({
    baseCurrency: base,
    quoteCurrency: quote,
    // Decimal(18,8) — 문자열로 전달해 부동소수점 노이즈를 잘라낸다
    rate: cross(base, quote).toFixed(8),
    asOf: RATE_AS_OF,
    source: RATE_SOURCE,
  })),
);
