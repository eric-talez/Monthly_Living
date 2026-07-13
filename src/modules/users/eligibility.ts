import type {
  BookingStatus,
  DisputeStatus,
  PaymentStatus,
  Prisma,
  TicketStatus,
  UserRole,
  UserStatus,
} from '@/generated/prisma/client';

/**
 * 탈퇴 가능 여부 정책 — 단일 정책 지점 (순수 모듈: DB·env 값 import 금지,
 * generated client는 type-only로만 참조해 unit test가 엔진 없이 로드한다).
 *
 * "차단"은 탈퇴 후 운영 처리가 필요한 활성 상태를 뜻한다. terminal/역사 상태는
 * tombstone User에 연결된 채 보존된다 — docs/decisions/account-deletion-and-anonymization.md.
 */

/** 차단 Booking 상태 — DRAFT는 완료 상태가 아니므로 차단에 포함한다(fail-closed) */
export const BLOCKING_BOOKING_STATUSES = [
  'DRAFT',
  'PENDING',
  'ACCEPTED',
  'PAYMENT_PENDING',
  'CONFIRMED',
  'IN_PROGRESS',
  'CANCELLATION_REQUESTED',
  'DISPUTED',
] as const satisfies readonly BookingStatus[];

/** terminal Booking 상태(비차단): REJECTED · COMPLETED · CANCELLED · REFUNDED */
export const BLOCKING_PAYMENT_STATUSES = [
  'PENDING',
  'PROCESSING',
] as const satisfies readonly PaymentStatus[];

export const BLOCKING_DISPUTE_STATUSES = [
  'OPEN',
  'UNDER_REVIEW',
] as const satisfies readonly DisputeStatus[];

export const BLOCKING_TICKET_STATUSES = [
  'OPEN',
  'IN_PROGRESS',
  'WAITING',
] as const satisfies readonly TicketStatus[];

export interface DeletionUserSnapshot {
  role: UserRole;
  status: UserStatus;
  deletedAt: Date | null;
}

export interface DeletionObligationSnapshot {
  /** BLOCKING_BOOKING_STATUSES에 해당하는 travelerId 예약 수 */
  activeBookingCount: number;
  /** 사용자 예약(booking.travelerId)에 걸린 PENDING/PROCESSING 결제 수 */
  activePaymentCount: number;
  /** 사용자가 제기했거나(raisedById) 사용자 예약에 연결된 활성 분쟁 수 */
  activeDisputeCount: number;
  /** 사용자가 작성했거나(userId) 사용자 예약에 연결된 활성 지원 티켓 수 */
  activeTicketCount: number;
  /** TRAVELER인데 ExpertProfile이 존재하는 비정상 상태(전문가 전환 진행 중 등) */
  expertProfileCount: number;
  /** status=ACTIVE인데 Booking이 연결된 비정상 quote 수 (정상은 CONSUMED) */
  anomalousActiveQuoteCount: number;
}

export type DeletionIneligibleReason =
  'not-traveler' | 'not-active' | 'already-deleted' | 'expert-profile-anomaly' | 'has-obligations';

export type DeletionEligibility =
  { eligible: true } | { eligible: false; reason: DeletionIneligibleReason };

/** 판정 우선순위: role → status → deletedAt → expertProfile 비정상 → 활성 운영 기록 */
export function classifyDeletionEligibility(
  user: DeletionUserSnapshot,
  obligations: DeletionObligationSnapshot,
): DeletionEligibility {
  if (user.role !== 'TRAVELER') {
    return { eligible: false, reason: 'not-traveler' };
  }
  if (user.status !== 'ACTIVE') {
    return { eligible: false, reason: 'not-active' };
  }
  if (user.deletedAt !== null) {
    return { eligible: false, reason: 'already-deleted' };
  }
  if (obligations.expertProfileCount > 0) {
    return { eligible: false, reason: 'expert-profile-anomaly' };
  }
  const activeObligations =
    obligations.activeBookingCount +
    obligations.activePaymentCount +
    obligations.activeDisputeCount +
    obligations.activeTicketCount +
    obligations.anomalousActiveQuoteCount;
  if (activeObligations > 0) {
    return { eligible: false, reason: 'has-obligations' };
  }
  return { eligible: true };
}

/**
 * 차단 대상 운영 기록 집계. PrismaClient와 transaction client 모두 받는다 —
 * 요청 시점 검사와 탈퇴 transaction 내부 재검사가 같은 로직을 공유한다.
 * (interactive transaction 안에서는 병렬 쿼리를 피하기 위해 순차 실행)
 */
export async function loadDeletionObligations(
  db: Prisma.TransactionClient,
  userId: string,
): Promise<DeletionObligationSnapshot> {
  const activeBookingCount = await db.booking.count({
    where: { travelerId: userId, status: { in: [...BLOCKING_BOOKING_STATUSES] } },
  });
  const activePaymentCount = await db.payment.count({
    where: { status: { in: [...BLOCKING_PAYMENT_STATUSES] }, booking: { travelerId: userId } },
  });
  const activeDisputeCount = await db.dispute.count({
    where: {
      status: { in: [...BLOCKING_DISPUTE_STATUSES] },
      OR: [{ raisedById: userId }, { booking: { travelerId: userId } }],
    },
  });
  const activeTicketCount = await db.supportTicket.count({
    where: {
      status: { in: [...BLOCKING_TICKET_STATUSES] },
      OR: [{ userId }, { booking: { travelerId: userId } }],
    },
  });
  const expertProfileCount = await db.expertProfile.count({ where: { userId } });
  const anomalousActiveQuoteCount = await db.bookingQuote.count({
    where: { travelerId: userId, status: 'ACTIVE', booking: { isNot: null } },
  });

  return {
    activeBookingCount,
    activePaymentCount,
    activeDisputeCount,
    activeTicketCount,
    expertProfileCount,
    anomalousActiveQuoteCount,
  };
}
