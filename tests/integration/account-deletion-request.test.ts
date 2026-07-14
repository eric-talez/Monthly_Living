import { afterAll, describe, expect, it } from 'vitest';

import { ERROR_CODES } from '@/lib/errors';
import { ACCOUNT_DELETION_TOKEN_TTL_MS } from '@/modules/auth/constants';
import { hashToken } from '@/modules/auth/tokens';
import { requestAccountDeletion } from '@/modules/users/account-deletion';
import {
  BLOCKING_BOOKING_STATUSES,
  BLOCKING_DISPUTE_STATUSES,
  BLOCKING_PAYMENT_STATUSES,
  BLOCKING_TICKET_STATUSES,
  loadDeletionObligations,
} from '@/modules/users/eligibility';
import type { BookingStatus, PaymentStatus } from '@/generated/prisma/client';

import { cleanupOwnData, disconnect, testPrisma } from './helpers/db';
import { createTestDeps, type TestDeps } from './helpers/deps';
import {
  cleanupFixtures,
  createBookingChain,
  createDeletionTraveler,
  createDispute,
  createExpertContext,
  createStandaloneActiveQuote,
  createSupportTicket,
} from './helpers/fixtures';
import { TEST_CTX } from './helpers/users';

afterAll(async () => {
  await cleanupFixtures();
  await cleanupOwnData();
  await disconnect();
});

/** 가입 인증 메일과 구분해 탈퇴 확인 메일만 집는다 */
function deletionEmails(testDeps: TestDeps) {
  return testDeps.sentEmails.filter(
    (message) =>
      message.subject.includes('탈퇴') || message.subject.toLowerCase().includes('deletion'),
  );
}

describe('requestAccountDeletion — 정상 흐름', () => {
  it("'sent': DB에는 sha256 hash만 저장되고 TTL 30분, 원 이메일로 확인 링크가 발송된다", async () => {
    const fixedNow = new Date();
    const testDeps = createTestDeps({ now: () => fixedNow });
    const traveler = await createDeletionTraveler('req-ok', { testDeps });

    await expect(
      requestAccountDeletion({ sessionUserId: traveler.id }, TEST_CTX, testDeps.deps),
    ).resolves.toBe('sent');

    const emails = deletionEmails(testDeps);
    expect(emails).toHaveLength(1);
    expect(emails[0].to).toBe(traveler.email);

    // 원문 token은 이메일 링크에만 있고 DB에는 hash만 있다
    const tokenMatch = emails[0].text.match(
      /\/settings\/account\/delete\/confirm\?token=([A-Za-z0-9_-]{43})/,
    );
    expect(tokenMatch).not.toBeNull();
    const rawToken = tokenMatch![1];

    const rows = await testPrisma.accountDeletionToken.findMany({
      where: { userId: traveler.id },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].tokenHash).toBe(hashToken(rawToken));
    expect(rows[0].tokenHash).not.toBe(rawToken);
    expect(rows[0].usedAt).toBeNull();
    expect(rows[0].expiresAt.getTime()).toBe(fixedNow.getTime() + ACCOUNT_DELETION_TOKEN_TTL_MS);
  });

  it('preferredLanguage=en 사용자는 영어 제목과 /en prefix 링크를 받는다', async () => {
    const testDeps = createTestDeps();
    const traveler = await createDeletionTraveler('req-en', { testDeps });
    await testPrisma.user.update({
      where: { id: traveler.id },
      data: { preferredLanguage: 'en' },
    });

    await expect(
      requestAccountDeletion({ sessionUserId: traveler.id }, TEST_CTX, testDeps.deps),
    ).resolves.toBe('sent');

    const [email] = deletionEmails(testDeps);
    expect(email.subject.toLowerCase()).toContain('account deletion');
    expect(email.text).toContain('/en/settings/account/delete/confirm?token=');
  });

  it('재요청 시 미사용 토큰은 교체되고, 사용된 토큰은 감사용으로 보존된다', async () => {
    const testDeps = createTestDeps();
    const traveler = await createDeletionTraveler('req-replace', { testDeps });

    // 인위적으로 이미 사용된 토큰을 심는다 — 교체 대상이 아니어야 한다
    await testPrisma.accountDeletionToken.create({
      data: {
        userId: traveler.id,
        tokenHash: hashToken(`used-${traveler.email}`),
        expiresAt: new Date(Date.now() + ACCOUNT_DELETION_TOKEN_TTL_MS),
        usedAt: new Date(),
      },
    });

    await requestAccountDeletion({ sessionUserId: traveler.id }, TEST_CTX, testDeps.deps);
    await requestAccountDeletion({ sessionUserId: traveler.id }, TEST_CTX, testDeps.deps);

    const rows = await testPrisma.accountDeletionToken.findMany({
      where: { userId: traveler.id },
    });
    // 미사용 1(최신) + 사용됨 1(보존) — 활성 토큰이 복수가 되지 않는다
    expect(rows.filter((row) => row.usedAt === null)).toHaveLength(1);
    expect(rows.filter((row) => row.usedAt !== null)).toHaveLength(1);
  });
});

describe('requestAccountDeletion — 역할·상태 fail-closed', () => {
  it.each([['EXPERT'], ['ADMIN']] as const)(
    "%s 역할은 'unsupported' — 토큰도 메일도 만들지 않는다",
    async (role) => {
      const testDeps = createTestDeps();
      const traveler = await createDeletionTraveler(`req-role-${role.toLowerCase()}`, {
        testDeps,
      });
      await testPrisma.user.update({ where: { id: traveler.id }, data: { role } });

      await expect(
        requestAccountDeletion({ sessionUserId: traveler.id }, TEST_CTX, testDeps.deps),
      ).resolves.toBe('unsupported');
      expect(deletionEmails(testDeps)).toHaveLength(0);
      await expect(
        testPrisma.accountDeletionToken.count({ where: { userId: traveler.id } }),
      ).resolves.toBe(0);
    },
  );

  it.each([
    ['SUSPENDED', { status: 'SUSPENDED' as const }],
    ['soft-deleted', { status: 'DELETED' as const, deletedAt: new Date() }],
  ])("%s 사용자는 'unsupported' (fail-closed)", async (label, data) => {
    const testDeps = createTestDeps();
    const traveler = await createDeletionTraveler(`req-status-${label.replace(/[^a-z]/gi, '')}`, {
      testDeps,
    });
    await testPrisma.user.update({ where: { id: traveler.id }, data });

    await expect(
      requestAccountDeletion({ sessionUserId: traveler.id }, TEST_CTX, testDeps.deps),
    ).resolves.toBe('unsupported');
    expect(deletionEmails(testDeps)).toHaveLength(0);
  });

  it("미존재 userId는 'unsupported'", async () => {
    const { deps } = createTestDeps();
    await expect(
      requestAccountDeletion({ sessionUserId: 'no-such-user-id' }, TEST_CTX, deps),
    ).resolves.toBe('unsupported');
  });
});

describe('requestAccountDeletion — 운영 기록 차단 매트릭스', () => {
  it('Booking 12개 상태: 차단 8종(DRAFT 포함)만 activeBookingCount에 잡힌다', async () => {
    const traveler = await createDeletionTraveler('req-bk-matrix');
    const { bookingId } = await createBookingChain(traveler.id, { bookingStatus: 'COMPLETED' });

    const allStatuses: BookingStatus[] = [
      'DRAFT',
      'PENDING',
      'ACCEPTED',
      'REJECTED',
      'PAYMENT_PENDING',
      'CONFIRMED',
      'IN_PROGRESS',
      'COMPLETED',
      'CANCELLATION_REQUESTED',
      'CANCELLED',
      'REFUNDED',
      'DISPUTED',
    ];
    for (const status of allStatuses) {
      await testPrisma.booking.update({ where: { id: bookingId }, data: { status } });
      const obligations = await loadDeletionObligations(testPrisma, traveler.id);
      const shouldBlock = (BLOCKING_BOOKING_STATUSES as readonly BookingStatus[]).includes(status);
      expect(obligations.activeBookingCount, `status=${status}`).toBe(shouldBlock ? 1 : 0);
    }
  });

  it("차단 상태 Booking이 있으면 'blocked' — 메일 없음; terminal이면 'sent'", async () => {
    const testDeps = createTestDeps();
    const traveler = await createDeletionTraveler('req-bk-e2e', { testDeps });
    const { bookingId } = await createBookingChain(traveler.id, { bookingStatus: 'PENDING' });

    await expect(
      requestAccountDeletion({ sessionUserId: traveler.id }, TEST_CTX, testDeps.deps),
    ).resolves.toBe('blocked');
    expect(deletionEmails(testDeps)).toHaveLength(0);

    await testPrisma.booking.update({ where: { id: bookingId }, data: { status: 'COMPLETED' } });
    await expect(
      requestAccountDeletion({ sessionUserId: traveler.id }, TEST_CTX, testDeps.deps),
    ).resolves.toBe('sent');
  });

  it('Payment 상태: PENDING/PROCESSING만 activePaymentCount에 잡힌다', async () => {
    const traveler = await createDeletionTraveler('req-pay-matrix');
    // 결제는 완료된(비차단) 예약 위에 얹어 결제 상태만 격리 검증한다
    await createBookingChain(traveler.id, {
      bookingStatus: 'COMPLETED',
      paymentStatus: 'PENDING',
    });
    const payment = await testPrisma.payment.findFirstOrThrow({
      where: { booking: { travelerId: traveler.id } },
    });

    const allStatuses: PaymentStatus[] = [
      'PENDING',
      'PROCESSING',
      'SUCCEEDED',
      'FAILED',
      'CANCELLED',
      'REFUNDED',
      'PARTIALLY_REFUNDED',
    ];
    for (const status of allStatuses) {
      await testPrisma.payment.update({ where: { id: payment.id }, data: { status } });
      const obligations = await loadDeletionObligations(testPrisma, traveler.id);
      const shouldBlock = (BLOCKING_PAYMENT_STATUSES as readonly PaymentStatus[]).includes(status);
      expect(obligations.activePaymentCount, `status=${status}`).toBe(shouldBlock ? 1 : 0);
    }
  });

  it('Dispute: 본인 제기뿐 아니라 타인이 제기해도 본인 예약이면 차단된다', async () => {
    const traveler = await createDeletionTraveler('req-dispute');
    const { bookingId, context } = await createBookingChain(traveler.id, {
      bookingStatus: 'COMPLETED',
    });

    // 전문가(타인)가 여행자의 예약에 제기한 분쟁 — raisedById ≠ traveler
    const disputeId = await createDispute(bookingId, context.expertUserId, 'OPEN');
    let obligations = await loadDeletionObligations(testPrisma, traveler.id);
    expect(obligations.activeDisputeCount).toBe(1);

    for (const status of BLOCKING_DISPUTE_STATUSES) {
      await testPrisma.dispute.update({ where: { id: disputeId }, data: { status } });
      obligations = await loadDeletionObligations(testPrisma, traveler.id);
      expect(obligations.activeDisputeCount, `status=${status}`).toBe(1);
    }
    for (const status of ['RESOLVED', 'CLOSED'] as const) {
      await testPrisma.dispute.update({ where: { id: disputeId }, data: { status } });
      obligations = await loadDeletionObligations(testPrisma, traveler.id);
      expect(obligations.activeDisputeCount, `status=${status}`).toBe(0);
    }
  });

  it('SupportTicket: 본인 작성뿐 아니라 타인이 작성해도 본인 예약에 연결되면 차단된다', async () => {
    const traveler = await createDeletionTraveler('req-ticket');
    const { bookingId, context } = await createBookingChain(traveler.id, {
      bookingStatus: 'COMPLETED',
    });

    // 본인 작성 티켓 상태 매트릭스 (booking 미연결)
    const ownTicketId = await createSupportTicket(traveler.id, 'OPEN');
    for (const status of BLOCKING_TICKET_STATUSES) {
      await testPrisma.supportTicket.update({ where: { id: ownTicketId }, data: { status } });
      const obligations = await loadDeletionObligations(testPrisma, traveler.id);
      expect(obligations.activeTicketCount, `own status=${status}`).toBe(1);
    }
    await testPrisma.supportTicket.update({
      where: { id: ownTicketId },
      data: { status: 'RESOLVED' },
    });
    let obligations = await loadDeletionObligations(testPrisma, traveler.id);
    expect(obligations.activeTicketCount).toBe(0);

    // 타인(전문가) 작성 + 여행자 예약 연결 티켓 — 운영 처리 중이면 차단
    const otherTicketId = await createSupportTicket(context.expertUserId, 'IN_PROGRESS', bookingId);
    obligations = await loadDeletionObligations(testPrisma, traveler.id);
    expect(obligations.activeTicketCount).toBe(1);
    await testPrisma.supportTicket.update({
      where: { id: otherTicketId },
      data: { status: 'CLOSED' },
    });
    obligations = await loadDeletionObligations(testPrisma, traveler.id);
    expect(obligations.activeTicketCount).toBe(0);
  });

  it('BookingQuote: Booking이 연결된 ACTIVE quote(비정상)는 차단, 미연결 ACTIVE는 비차단', async () => {
    const testDeps = createTestDeps();
    const traveler = await createDeletionTraveler('req-quote', { testDeps });
    const { quoteId } = await createBookingChain(traveler.id, { bookingStatus: 'COMPLETED' });

    // 미연결 ACTIVE quote는 요청을 막지 않는다 (탈퇴 tx에서 삭제될 데이터)
    await createStandaloneActiveQuote(traveler.id);
    let obligations = await loadDeletionObligations(testPrisma, traveler.id);
    expect(obligations.anomalousActiveQuoteCount).toBe(0);
    await expect(
      requestAccountDeletion({ sessionUserId: traveler.id }, TEST_CTX, testDeps.deps),
    ).resolves.toBe('sent');

    // Booking에 연결된 quote가 ACTIVE로 남은 비정상 상태 — fail-closed 차단
    await testPrisma.bookingQuote.update({
      where: { id: quoteId },
      data: { status: 'ACTIVE', consumedAt: null },
    });
    obligations = await loadDeletionObligations(testPrisma, traveler.id);
    expect(obligations.anomalousActiveQuoteCount).toBe(1);
    await expect(
      requestAccountDeletion({ sessionUserId: traveler.id }, TEST_CTX, testDeps.deps),
    ).resolves.toBe('blocked');
  });

  it("TRAVELER인데 ExpertProfile이 있으면 'blocked' (비정상 fail-closed)", async () => {
    const testDeps = createTestDeps();
    const traveler = await createDeletionTraveler('req-anomaly', { testDeps });
    const context = await createExpertContext('req-anomaly');
    // 여행자 본인에게 ExpertProfile을 직접 부여 (전문가 전환 진행 중 시뮬레이션)
    await testPrisma.expertProfile.create({
      data: {
        userId: traveler.id,
        slug: `${traveler.id}-anomaly-profile`,
        displayName: '비정상 프로필',
        bio: '테스트',
        baseDestinationId: context.destinationId,
      },
    });

    await expect(
      requestAccountDeletion({ sessionUserId: traveler.id }, TEST_CTX, testDeps.deps),
    ).resolves.toBe('blocked');
    expect(deletionEmails(testDeps)).toHaveLength(0);

    // cleanupFixtures 순서(전 profile 일괄 삭제)에 안 잡히므로 직접 정리
    await testPrisma.expertProfile.delete({ where: { userId: traveler.id } });
  });
});

describe('requestAccountDeletion — rate limit', () => {
  it('user 한도가 발동한다 (기본 3회/1시간)', async () => {
    const testDeps = createTestDeps({ limiterMax: { deletionRequestByUser: 1 } });
    const traveler = await createDeletionTraveler('req-rl-user', { testDeps });

    await requestAccountDeletion({ sessionUserId: traveler.id }, TEST_CTX, testDeps.deps);
    await expect(
      requestAccountDeletion({ sessionUserId: traveler.id }, TEST_CTX, testDeps.deps),
    ).rejects.toMatchObject({ code: ERROR_CODES.RATE_LIMITED });
  });

  it('IP 한도가 발동한다 (기본 10회/1시간)', async () => {
    const testDeps = createTestDeps({ limiterMax: { deletionRequestByIp: 1 } });
    const travelerA = await createDeletionTraveler('req-rl-ip-a', { testDeps });
    const travelerB = await createDeletionTraveler('req-rl-ip-b', { testDeps });
    const ctx = { ...TEST_CTX, ipAddress: '203.0.113.77' };

    await requestAccountDeletion({ sessionUserId: travelerA.id }, ctx, testDeps.deps);
    await expect(
      requestAccountDeletion({ sessionUserId: travelerB.id }, ctx, testDeps.deps),
    ).rejects.toMatchObject({ code: ERROR_CODES.RATE_LIMITED });
  });

  it('IP limiter가 user limiter보다 먼저 소비된다 — IP 차단이 user 한도를 태우지 않는다', async () => {
    const testDeps = createTestDeps({
      limiterMax: { deletionRequestByIp: 1, deletionRequestByUser: 1 },
    });
    const travelerA = await createDeletionTraveler('req-order-a', { testDeps });
    const travelerB = await createDeletionTraveler('req-order-b', { testDeps });

    // 1) 같은 IP에서 A가 IP 한도(1)를 소진
    const sharedIpCtx = { ...TEST_CTX, ipAddress: '198.51.100.30' };
    await requestAccountDeletion({ sessionUserId: travelerA.id }, sharedIpCtx, testDeps.deps);

    // 2) 같은 IP에서 B 요청 → IP 단계에서 차단
    await expect(
      requestAccountDeletion({ sessionUserId: travelerB.id }, sharedIpCtx, testDeps.deps),
    ).rejects.toMatchObject({ code: ERROR_CODES.RATE_LIMITED });

    // 3) 다른 IP에서 B 첫 요청은 허용 — user 한도(1)가 소비되지 않았음을 증명.
    //    user limiter를 먼저 소비하는 구현이라면 2단계가 한도를 태워 여기서 차단된다.
    const otherIpCtx = { ...TEST_CTX, ipAddress: '198.51.100.31' };
    await expect(
      requestAccountDeletion({ sessionUserId: travelerB.id }, otherIpCtx, testDeps.deps),
    ).resolves.toBe('sent');
  });
});
