import { describe, expect, it } from 'vitest';

import {
  BLOCKING_BOOKING_STATUSES,
  BLOCKING_DISPUTE_STATUSES,
  BLOCKING_PAYMENT_STATUSES,
  BLOCKING_TICKET_STATUSES,
  classifyDeletionEligibility,
  type DeletionObligationSnapshot,
  type DeletionUserSnapshot,
} from '@/modules/users/eligibility';

const activeTraveler: DeletionUserSnapshot = {
  role: 'TRAVELER',
  status: 'ACTIVE',
  deletedAt: null,
};

function obligations(
  overrides: Partial<DeletionObligationSnapshot> = {},
): DeletionObligationSnapshot {
  return {
    activeBookingCount: 0,
    activePaymentCount: 0,
    activeDisputeCount: 0,
    activeTicketCount: 0,
    expertProfileCount: 0,
    anomalousActiveQuoteCount: 0,
    ...overrides,
  };
}

describe('classifyDeletionEligibility', () => {
  it('ACTIVE TRAVELER + 운영 기록 없음이면 eligible', () => {
    expect(classifyDeletionEligibility(activeTraveler, obligations())).toEqual({
      eligible: true,
    });
  });

  it.each([
    ['EXPERT', { ...activeTraveler, role: 'EXPERT' } satisfies DeletionUserSnapshot],
    ['ADMIN', { ...activeTraveler, role: 'ADMIN' } satisfies DeletionUserSnapshot],
  ])('%s 역할은 not-traveler로 거부한다', (_label, user) => {
    expect(classifyDeletionEligibility(user, obligations())).toEqual({
      eligible: false,
      reason: 'not-traveler',
    });
  });

  it.each([
    ['SUSPENDED', { ...activeTraveler, status: 'SUSPENDED' } satisfies DeletionUserSnapshot],
    ['DELETED', { ...activeTraveler, status: 'DELETED' } satisfies DeletionUserSnapshot],
  ])('%s 상태는 not-active로 거부한다', (_label, user) => {
    expect(classifyDeletionEligibility(user, obligations())).toEqual({
      eligible: false,
      reason: 'not-active',
    });
  });

  it('deletedAt이 설정된 사용자는 already-deleted로 거부한다', () => {
    const user: DeletionUserSnapshot = { ...activeTraveler, deletedAt: new Date() };
    expect(classifyDeletionEligibility(user, obligations())).toEqual({
      eligible: false,
      reason: 'already-deleted',
    });
  });

  it('TRAVELER인데 ExpertProfile이 있으면 expert-profile-anomaly로 거부한다 (fail-closed)', () => {
    expect(
      classifyDeletionEligibility(activeTraveler, obligations({ expertProfileCount: 1 })),
    ).toEqual({ eligible: false, reason: 'expert-profile-anomaly' });
  });

  it.each([
    ['활성 예약', { activeBookingCount: 1 }],
    ['처리 중 결제', { activePaymentCount: 1 }],
    ['미해결 분쟁', { activeDisputeCount: 1 }],
    ['처리 중 지원 티켓', { activeTicketCount: 1 }],
    ['Booking 연결 ACTIVE quote(비정상)', { anomalousActiveQuoteCount: 1 }],
  ] as const)('%s이 있으면 has-obligations로 거부한다', (_label, partial) => {
    expect(classifyDeletionEligibility(activeTraveler, obligations(partial))).toEqual({
      eligible: false,
      reason: 'has-obligations',
    });
  });

  it('복수 운영 기록도 단일 has-obligations로 일반화한다', () => {
    expect(
      classifyDeletionEligibility(
        activeTraveler,
        obligations({ activeBookingCount: 2, activeDisputeCount: 1, activeTicketCount: 3 }),
      ),
    ).toEqual({ eligible: false, reason: 'has-obligations' });
  });

  it('판정 우선순위: 역할이 운영 기록보다 먼저다 (EXPERT + 예약 → not-traveler)', () => {
    const expert: DeletionUserSnapshot = { ...activeTraveler, role: 'EXPERT' };
    expect(classifyDeletionEligibility(expert, obligations({ activeBookingCount: 5 }))).toEqual({
      eligible: false,
      reason: 'not-traveler',
    });
  });
});

describe('차단 상태 상수 — 계약 목록 회귀 핀', () => {
  it('Booking 차단 상태는 DRAFT를 포함한 8종이다 (terminal: REJECTED/COMPLETED/CANCELLED/REFUNDED)', () => {
    expect([...BLOCKING_BOOKING_STATUSES]).toEqual([
      'DRAFT',
      'PENDING',
      'ACCEPTED',
      'PAYMENT_PENDING',
      'CONFIRMED',
      'IN_PROGRESS',
      'CANCELLATION_REQUESTED',
      'DISPUTED',
    ]);
  });

  it('Payment 차단 상태는 PENDING/PROCESSING이다', () => {
    expect([...BLOCKING_PAYMENT_STATUSES]).toEqual(['PENDING', 'PROCESSING']);
  });

  it('Dispute 차단 상태는 OPEN/UNDER_REVIEW이다', () => {
    expect([...BLOCKING_DISPUTE_STATUSES]).toEqual(['OPEN', 'UNDER_REVIEW']);
  });

  it('SupportTicket 차단 상태는 OPEN/IN_PROGRESS/WAITING이다', () => {
    expect([...BLOCKING_TICKET_STATUSES]).toEqual(['OPEN', 'IN_PROGRESS', 'WAITING']);
  });
});
