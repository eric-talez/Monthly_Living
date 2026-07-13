import type { BookingStatus, PaymentStatus } from '@/generated/prisma/client';

import { runId, testEmail, testPrisma } from './db';
import type { TestDeps } from './deps';
import { createRegisteredUser } from './users';

/**
 * 계정 탈퇴 테스트용 fixture — Booking 체인(CHECK 제약 충족)과 저비용 운영 기록.
 *
 * cleanup 규칙: 탈퇴로 tombstone이 된 사용자는 이메일이 runId prefix를 벗어나므로
 * cleanupOwnData()가 잡지 못한다 — 생성한 모든 User id를 추적하고, Restrict FK
 * 역순으로 fixture를 지운 뒤 추적 id로 사용자를 삭제한다.
 * 각 테스트 파일 afterAll에서 cleanupFixtures() → cleanupOwnData() → disconnect() 순서.
 */

let fixtureSeq = 0;
function fixtureKey(label: string): string {
  fixtureSeq += 1;
  return `${runId}-${label}-${fixtureSeq}`;
}

const trackedUserIds = new Set<string>();

/** 탈퇴(tombstone) 후에도 정리 가능하도록 생성 즉시 호출한다 */
export function trackUserId(userId: string): void {
  trackedUserIds.add(userId);
}

const registry = {
  paymentIds: [] as string[],
  disputeIds: [] as string[],
  ticketIds: [] as string[],
  reviewIds: [] as string[],
  bookingIds: [] as string[],
  quoteIds: [] as string[],
  programIds: [] as string[],
  expertProfileIds: [] as string[],
  destinationIds: [] as string[],
  categoryIds: [] as string[],
};

/** 가입·인증까지 마친 여행자 + id 추적 */
export async function createDeletionTraveler(
  label: string,
  options: { testDeps?: TestDeps } = {},
): Promise<{ id: string; email: string; password: string; testDeps: TestDeps }> {
  const { email, password, testDeps } = await createRegisteredUser(label, {
    testDeps: options.testDeps,
  });
  const user = await testPrisma.user.findUniqueOrThrow({
    where: { email },
    select: { id: true },
  });
  trackUserId(user.id);
  return { id: user.id, email, password, testDeps };
}

export interface ExpertContext {
  expertUserId: string;
  expertProfileId: string;
  destinationId: string;
  categoryId: string;
  programId: string;
}

/** Booking 체인의 공급자 측 그래프 — destination/category/expert/program */
export async function createExpertContext(label = 'exp'): Promise<ExpertContext> {
  const destination = await testPrisma.destination.create({
    data: {
      slug: fixtureKey(`${label}-dest`),
      countryCode: 'KR',
      countryNameKo: '대한민국',
      countryNameEn: 'South Korea',
      cityNameKo: '제주',
      cityNameEn: 'Jeju',
      latitude: 33.4996,
      longitude: 126.5312,
      timezone: 'Asia/Seoul',
      currency: 'KRW',
    },
    select: { id: true },
  });
  registry.destinationIds.push(destination.id);

  const category = await testPrisma.category.create({
    data: { slug: fixtureKey(`${label}-cat`), nameKo: '테스트', nameEn: 'Test' },
    select: { id: true },
  });
  registry.categoryIds.push(category.id);

  const expertUser = await testPrisma.user.create({
    data: {
      email: testEmail(fixtureKey(`${label}-owner`)),
      role: 'EXPERT',
      emailVerified: new Date(),
    },
    select: { id: true },
  });
  trackUserId(expertUser.id);

  const expertProfile = await testPrisma.expertProfile.create({
    data: {
      userId: expertUser.id,
      slug: fixtureKey(`${label}-profile`),
      displayName: '테스트 전문가',
      bio: '테스트용 전문가 프로필',
      baseDestinationId: destination.id,
    },
    select: { id: true },
  });
  registry.expertProfileIds.push(expertProfile.id);

  const program = await testPrisma.program.create({
    data: {
      expertId: expertProfile.id,
      destinationId: destination.id,
      categoryId: category.id,
      slug: fixtureKey(`${label}-prog`),
      title: '테스트 프로그램',
      shortDescription: '테스트',
      fullDescription: '테스트 프로그램 상세',
      programType: 'PRIVATE',
      durationDays: 30,
      sessionCount: 1,
      cancellationPolicy: 'flexible',
      basePrice: 100_000,
      currency: 'KRW',
    },
    select: { id: true },
  });
  registry.programIds.push(program.id);

  return {
    expertUserId: expertUser.id,
    expertProfileId: expertProfile.id,
    destinationId: destination.id,
    categoryId: category.id,
    programId: program.id,
  };
}

/** CHECK 충족 금액: subtotal 100000 + fee 10000 + tax 5000 - discount 0 = total 115000 */
const AMOUNTS = {
  subtotal: 100_000,
  serviceFee: 10_000,
  taxes: 5_000,
  discount: 0,
  total: 115_000,
};

/**
 * traveler의 Booking 체인 생성 (CONSUMED quote + booking [+payment] [+review]).
 * ExpertContext를 넘기면 공급자 그래프를 재사용한다 (상태 매트릭스 테스트용).
 */
export async function createBookingChain(
  travelerId: string,
  options: {
    context?: ExpertContext;
    bookingStatus?: BookingStatus;
    paymentStatus?: PaymentStatus | null;
    withReview?: boolean;
  } = {},
): Promise<{ bookingId: string; quoteId: string; context: ExpertContext }> {
  const context = options.context ?? (await createExpertContext());
  const bookingStatus = options.bookingStatus ?? 'COMPLETED';

  const quote = await testPrisma.bookingQuote.create({
    data: {
      travelerId,
      programId: context.programId,
      currency: 'KRW',
      unitPrice: AMOUNTS.subtotal,
      participantCount: 1,
      ...AMOUNTS,
      feeRateBps: 1000,
      status: 'CONSUMED',
      consumedAt: new Date(),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
    select: { id: true },
  });
  registry.quoteIds.push(quote.id);

  const startsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const booking = await testPrisma.booking.create({
    data: {
      bookingNumber: fixtureKey('bk'),
      travelerId,
      expertId: context.expertProfileId,
      programId: context.programId,
      quoteId: quote.id,
      bookingType: 'REQUEST',
      status: bookingStatus,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 30 * 24 * 60 * 60 * 1000),
      timezoneSnapshot: 'Asia/Seoul',
      participantCount: 1,
      programTitleSnapshot: '테스트 프로그램',
      expertDisplayNameSnapshot: '테스트 전문가',
      cancellationPolicySnapshot: 'flexible',
      contractSnapshot: { version: 1 },
      currency: 'KRW',
      ...AMOUNTS,
    },
    select: { id: true },
  });
  registry.bookingIds.push(booking.id);

  if (options.paymentStatus) {
    const payment = await testPrisma.payment.create({
      data: {
        bookingId: booking.id,
        provider: 'mock',
        providerPaymentId: fixtureKey('pay'),
        amount: AMOUNTS.total,
        currency: 'KRW',
        status: options.paymentStatus,
      },
      select: { id: true },
    });
    registry.paymentIds.push(payment.id);
  }

  if (options.withReview) {
    const review = await testPrisma.review.create({
      data: {
        bookingId: booking.id,
        travelerId,
        expertId: context.expertProfileId,
        programId: context.programId,
        rating: 5,
        content: '테스트 리뷰',
      },
      select: { id: true },
    });
    registry.reviewIds.push(review.id);
  }

  return { bookingId: booking.id, quoteId: quote.id, context };
}

/** 미소비 quote — status ACTIVE, booking 미연결 (탈퇴 tx에서 삭제 대상) */
export async function createStandaloneActiveQuote(
  travelerId: string,
  context?: ExpertContext,
): Promise<{ quoteId: string; context: ExpertContext }> {
  const resolved = context ?? (await createExpertContext('quote'));
  const quote = await testPrisma.bookingQuote.create({
    data: {
      travelerId,
      programId: resolved.programId,
      currency: 'KRW',
      unitPrice: AMOUNTS.subtotal,
      participantCount: 1,
      ...AMOUNTS,
      feeRateBps: 1000,
      status: 'ACTIVE',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
    select: { id: true },
  });
  registry.quoteIds.push(quote.id);
  return { quoteId: quote.id, context: resolved };
}

export async function createSupportTicket(
  userId: string,
  status: 'OPEN' | 'IN_PROGRESS' | 'WAITING' | 'RESOLVED' | 'CLOSED',
  bookingId?: string,
): Promise<string> {
  const ticket = await testPrisma.supportTicket.create({
    data: {
      userId,
      bookingId: bookingId ?? null,
      category: 'ACCOUNT',
      subject: '테스트 문의',
      description: '테스트 문의 본문',
      status,
    },
    select: { id: true },
  });
  registry.ticketIds.push(ticket.id);
  return ticket.id;
}

export async function createDispute(
  bookingId: string,
  raisedById: string,
  status: 'OPEN' | 'UNDER_REVIEW' | 'RESOLVED' | 'CLOSED',
): Promise<string> {
  const dispute = await testPrisma.dispute.create({
    data: { bookingId, raisedById, reason: '테스트 분쟁', status },
    select: { id: true },
  });
  registry.disputeIds.push(dispute.id);
  return dispute.id;
}

/** 알림 + 채널 발송 기록 — 탈퇴 시 DB cascade로 함께 사라져야 한다 */
export async function createNotificationWithDelivery(userId: string): Promise<string> {
  const notification = await testPrisma.notification.create({
    data: {
      userId,
      type: 'SYSTEM',
      title: '테스트 알림',
      body: '테스트 알림 본문',
      deliveries: { create: { channel: 'EMAIL', status: 'SENT' } },
    },
    select: { id: true },
  });
  return notification.id;
}

export async function createMatchRequest(userId: string): Promise<string> {
  const matchRequest = await testPrisma.matchRequest.create({
    data: { userId, purposes: ['workation'], durationDays: 30 },
    select: { id: true },
  });
  return matchRequest.id;
}

/** OAuth Account 행 직접 삽입 — 연결된 소셜 로그인 시뮬레이션 */
export async function createOAuthAccountRow(
  userId: string,
  provider: 'google' | 'kakao' = 'google',
): Promise<string> {
  const account = await testPrisma.account.create({
    data: {
      userId,
      type: 'oidc',
      provider,
      providerAccountId: fixtureKey(`sub-${provider}`),
    },
    select: { id: true },
  });
  return account.id;
}

export async function createFavorites(userId: string, context: ExpertContext): Promise<void> {
  await testPrisma.programFavorite.create({
    data: { userId, programId: context.programId },
  });
  await testPrisma.expertFavorite.create({
    data: { userId, expertId: context.expertProfileId },
  });
}

/** Restrict FK 역순 정리 — 각 테스트 파일 afterAll에서 cleanupOwnData()보다 먼저 호출 */
export async function cleanupFixtures(): Promise<void> {
  await testPrisma.payment.deleteMany({ where: { id: { in: registry.paymentIds } } });
  await testPrisma.dispute.deleteMany({ where: { id: { in: registry.disputeIds } } });
  await testPrisma.supportTicket.deleteMany({ where: { id: { in: registry.ticketIds } } });
  await testPrisma.review.deleteMany({ where: { id: { in: registry.reviewIds } } });
  await testPrisma.booking.deleteMany({ where: { id: { in: registry.bookingIds } } });
  await testPrisma.bookingQuote.deleteMany({ where: { id: { in: registry.quoteIds } } });
  await testPrisma.program.deleteMany({ where: { id: { in: registry.programIds } } });
  await testPrisma.expertProfile.deleteMany({
    where: { id: { in: registry.expertProfileIds } },
  });
  await testPrisma.destination.deleteMany({ where: { id: { in: registry.destinationIds } } });
  await testPrisma.category.deleteMany({ where: { id: { in: registry.categoryIds } } });
  // tombstone 사용자는 이메일이 runId prefix를 벗어난다 — 추적 id로 삭제
  // (favorites/notifications/matchRequests/accounts/consents/tokens는 user cascade)
  await testPrisma.user.deleteMany({ where: { id: { in: [...trackedUserIds] } } });
}
