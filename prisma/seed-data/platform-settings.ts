// 플랫폼 운영 설정 초기값 (관리자 화면에서 변경 가능한 값의 시작점)
export const platformSettingSeeds: { key: string; value: unknown }[] = [
  // 플랫폼 서비스 수수료율 (basis points, 1500 = 15%)
  { key: 'service_fee_bps', value: 1500 },
  // 세금율 (bps) — 초기 0, 세무 정책 확정 시 갱신
  { key: 'tax_rate_bps', value: 0 },
  // 약관·개인정보처리방침 버전 (ConsentRecord.version과 연동)
  { key: 'terms_version', value: '2026-07-01' },
  { key: 'privacy_version', value: '2026-07-01' },
  // BookingQuote 유효 시간 (분)
  { key: 'quote_ttl_minutes', value: 30 },
];
