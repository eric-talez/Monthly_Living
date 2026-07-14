import { afterAll, describe, expect, it, vi } from 'vitest';

import { ERROR_CODES } from '@/lib/errors';
import { generateRawToken, hashToken } from '@/modules/auth/tokens';
import {
  limiterKey,
  loginWithCredentials,
  registerUser,
  requestPasswordReset,
} from '@/modules/auth/service';
import {
  confirmDeletionCore,
  deleteAndAnonymizeTravelerAccount,
  getAccountDeletionPreflight,
  requestAccountDeletion,
  tombstoneEmailFor,
  type DeletionCookieStore,
} from '@/modules/users/account-deletion';
import {
  deletionTokenCookieName,
  type DeletionCookieClearSpec,
} from '@/modules/users/deletion-token-cookie';

import { cleanupOwnData, disconnect, testEmail, testPrisma } from './helpers/db';
import { createTestDeps, extractTokenFromEmail, type TestDeps } from './helpers/deps';
import {
  cleanupFixtures,
  createBookingChain,
  createDeletionTraveler,
  createDispute,
  createFavorites,
  createMatchRequest,
  createNotificationWithDelivery,
  createOAuthAccountRow,
  createStandaloneActiveQuote,
  createSupportTicket,
  trackUserId,
} from './helpers/fixtures';
import {
  createOAuthTestApp,
  expectSuccessRedirect,
  performGoogleLogin,
  performKakaoLogin,
} from './helpers/oauth';
import {
  CookieJar,
  fetchSession,
  SESSION_COOKIE,
  sessionUser,
  signInWithCredentials,
} from './helpers/session';
import { registerInput, TEST_CTX, TEST_IP } from './helpers/users';

afterAll(async () => {
  await cleanupFixtures();
  await cleanupOwnData();
  await disconnect();
});

const CTX = { ipAddress: TEST_IP };

/** 탈퇴 요청 후 확인 메일에서 원문 token을 꺼낸다 */
async function issueDeletionToken(travelerId: string, testDeps: TestDeps): Promise<string> {
  const before = testDeps.sentEmails.length;
  const result = await requestAccountDeletion(
    { sessionUserId: travelerId },
    TEST_CTX,
    testDeps.deps,
  );
  if (result !== 'sent') {
    throw new Error(`탈퇴 요청 실패: ${result}`);
  }
  return extractTokenFromEmail(testDeps.sentEmails[before]);
}

describe('getAccountDeletionPreflight — GET은 DB를 변경하지 않는다', () => {
  it("'ok' 판정 후에도 토큰은 미사용으로 남고, 같은 토큰으로 POST가 성공한다", async () => {
    const testDeps = createTestDeps();
    const traveler = await createDeletionTraveler('pre-ok', { testDeps });
    const rawToken = await issueDeletionToken(traveler.id, testDeps);

    await expect(
      getAccountDeletionPreflight({ sessionUserId: traveler.id, rawToken }, testDeps.deps),
    ).resolves.toBe('ok');

    // GET(preflight) 이후 무변경 — 스캐너가 링크를 열어도 소비되지 않는다
    const token = await testPrisma.accountDeletionToken.findUniqueOrThrow({
      where: { tokenHash: hashToken(rawToken) },
    });
    expect(token.usedAt).toBeNull();
    const user = await testPrisma.user.findUniqueOrThrow({ where: { id: traveler.id } });
    expect(user.status).toBe('ACTIVE');
    expect(user.email).toBe(traveler.email);

    // 같은 토큰으로 실제 소비(POST 경로)가 그대로 성공한다
    await expect(
      deleteAndAnonymizeTravelerAccount(
        { sessionUserId: traveler.id, rawToken },
        CTX,
        testDeps.deps,
      ),
    ).resolves.toBe('deleted');
  });

  it("형식 불량/타인 토큰/사용된 토큰은 'invalid', 만료는 'expired', 장애물은 'blocked'", async () => {
    const testDeps = createTestDeps();
    const traveler = await createDeletionTraveler('pre-branch', { testDeps });
    const other = await createDeletionTraveler('pre-branch-other', { testDeps });
    const rawToken = await issueDeletionToken(traveler.id, testDeps);
    const tokenHash = hashToken(rawToken);

    await expect(
      getAccountDeletionPreflight(
        { sessionUserId: traveler.id, rawToken: 'not-a-token' },
        testDeps.deps,
      ),
    ).resolves.toBe('invalid');

    // 타인 세션 + 남의 토큰 — 존재 여부를 구분하지 않고 invalid
    await expect(
      getAccountDeletionPreflight({ sessionUserId: other.id, rawToken }, testDeps.deps),
    ).resolves.toBe('invalid');

    // 장애물이 있으면 blocked — 토큰은 여전히 미사용
    const { bookingId } = await createBookingChain(traveler.id, { bookingStatus: 'PENDING' });
    await expect(
      getAccountDeletionPreflight({ sessionUserId: traveler.id, rawToken }, testDeps.deps),
    ).resolves.toBe('blocked');
    await testPrisma.booking.update({ where: { id: bookingId }, data: { status: 'COMPLETED' } });

    // 만료
    await testPrisma.accountDeletionToken.update({
      where: { tokenHash },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await expect(
      getAccountDeletionPreflight({ sessionUserId: traveler.id, rawToken }, testDeps.deps),
    ).resolves.toBe('expired');

    // 사용됨
    await testPrisma.accountDeletionToken.update({
      where: { tokenHash },
      data: { expiresAt: new Date(Date.now() + 60_000), usedAt: new Date() },
    });
    await expect(
      getAccountDeletionPreflight({ sessionUserId: traveler.id, rawToken }, testDeps.deps),
    ).resolves.toBe('invalid');

    // preflight 분기들이 사용자 상태를 바꾸지 않았다
    const user = await testPrisma.user.findUniqueOrThrow({ where: { id: traveler.id } });
    expect(user.status).toBe('ACTIVE');
  });
});

describe('deleteAndAnonymizeTravelerAccount — 하드 익명화 매트릭스', () => {
  it('구조화 PII 제거·인증 identity 삭제·거래 기록 보존을 한 번에 검증한다', async () => {
    const testDeps = createTestDeps();
    const traveler = await createDeletionTraveler('anon-matrix', { testDeps });

    // 구조화 PII를 실제 값으로 채운다 — tombstone이 전부 지워야 한다
    await testPrisma.user.update({
      where: { id: traveler.id },
      data: {
        name: '홍길동',
        image: 'https://example.com/avatar.png',
        fullName: '홍길동',
        nickname: '길동이',
        phone: '010-1234-5678',
        country: 'KR',
        preferredLanguage: 'en',
        preferredCurrency: 'USD',
        timezone: 'Asia/Bangkok',
      },
    });
    const before = await testPrisma.user.findUniqueOrThrow({ where: { id: traveler.id } });

    // 사용자 소유 데이터 전체 그래프
    await testPrisma.travelerProfile.create({ data: { userId: traveler.id } });
    const { context } = await createBookingChain(traveler.id, {
      bookingStatus: 'COMPLETED',
      paymentStatus: 'SUCCEEDED',
      withReview: true,
    });
    await createFavorites(traveler.id, context);
    const notificationId = await createNotificationWithDelivery(traveler.id);
    await createMatchRequest(traveler.id);
    await createOAuthAccountRow(traveler.id, 'google');
    await createStandaloneActiveQuote(traveler.id, context);
    await createSupportTicket(traveler.id, 'RESOLVED');
    const booking = await testPrisma.booking.findFirstOrThrow({
      where: { travelerId: traveler.id },
    });
    await createDispute(booking.id, traveler.id, 'RESOLVED');
    // 재설정 토큰 + 로그인 기록(원 이메일 매칭 삭제 대상)
    await requestPasswordReset({ email: traveler.email }, TEST_CTX, testDeps.deps);
    await loginWithCredentials(
      { email: traveler.email, password: traveler.password },
      CTX,
      testDeps.deps,
    );
    expect(
      await testPrisma.loginAttempt.count({ where: { email: traveler.email } }),
    ).toBeGreaterThan(0);

    const rawToken = await issueDeletionToken(traveler.id, testDeps);
    await expect(
      deleteAndAnonymizeTravelerAccount(
        { sessionUserId: traveler.id, rawToken },
        CTX,
        testDeps.deps,
      ),
    ).resolves.toBe('deleted');

    // ── User tombstone: row는 남고 구조화 PII만 사라진다 ──
    const after = await testPrisma.user.findUniqueOrThrow({ where: { id: traveler.id } });
    expect(after.id).toBe(before.id);
    expect(after.role).toBe(before.role);
    expect(after.createdAt.getTime()).toBe(before.createdAt.getTime());
    expect(after.email).toBe(tombstoneEmailFor(traveler.id));
    expect(after.passwordHash).toBeNull();
    expect(after.name).toBeNull();
    expect(after.image).toBeNull();
    expect(after.emailVerified).toBeNull();
    expect(after.fullName).toBeNull();
    expect(after.nickname).toBeNull();
    expect(after.phone).toBeNull();
    expect(after.country).toBeNull();
    expect(after.preferredLanguage).toBe('ko');
    expect(after.preferredCurrency).toBe('KRW');
    expect(after.timezone).toBe('Asia/Seoul');
    expect(after.status).toBe('DELETED');
    expect(after.deletedAt).not.toBeNull();

    // ── 삭제되어야 하는 것 ──
    const id = traveler.id;
    expect(await testPrisma.account.count({ where: { userId: id } })).toBe(0);
    expect(await testPrisma.emailVerificationToken.count({ where: { userId: id } })).toBe(0);
    expect(await testPrisma.passwordResetToken.count({ where: { userId: id } })).toBe(0);
    expect(await testPrisma.accountDeletionToken.count({ where: { userId: id } })).toBe(0);
    expect(await testPrisma.travelerProfile.findUnique({ where: { userId: id } })).toBeNull();
    expect(await testPrisma.programFavorite.count({ where: { userId: id } })).toBe(0);
    expect(await testPrisma.expertFavorite.count({ where: { userId: id } })).toBe(0);
    expect(await testPrisma.notification.count({ where: { userId: id } })).toBe(0);
    expect(await testPrisma.notificationDelivery.count({ where: { notificationId } })).toBe(0); // DB ON DELETE CASCADE
    expect(await testPrisma.matchRequest.count({ where: { userId: id } })).toBe(0);
    expect(await testPrisma.loginAttempt.count({ where: { email: traveler.email } })).toBe(0);
    // 미소비 ACTIVE quote는 제거 — tombstone 사용자에게 ACTIVE quote 0건
    expect(
      await testPrisma.bookingQuote.count({ where: { travelerId: id, status: 'ACTIVE' } }),
    ).toBe(0);

    // ── 보존되어야 하는 것 ──
    expect(await testPrisma.consentRecord.count({ where: { userId: id } })).toBe(3);
    const keptBooking = await testPrisma.booking.findUniqueOrThrow({
      where: { id: booking.id },
    });
    expect(keptBooking.travelerId).toBe(id); // 역사 기록은 tombstone id에 그대로 연결
    expect(keptBooking.programTitleSnapshot).toBe(booking.programTitleSnapshot);
    expect(keptBooking.total).toBe(booking.total);
    expect(
      await testPrisma.bookingQuote.count({ where: { travelerId: id, status: 'CONSUMED' } }),
    ).toBe(1);
    expect(await testPrisma.payment.count({ where: { booking: { travelerId: id } } })).toBe(1);
    expect(await testPrisma.review.count({ where: { travelerId: id } })).toBe(1);
    expect(await testPrisma.supportTicket.count({ where: { userId: id } })).toBe(1);
    expect(await testPrisma.dispute.count({ where: { raisedById: id } })).toBe(1);
  });

  it("타인 토큰으로는 'invalid' — 토큰 소유자도 세션 사용자도 무변경", async () => {
    const testDeps = createTestDeps();
    const owner = await createDeletionTraveler('confirm-owner', { testDeps });
    const attacker = await createDeletionTraveler('confirm-attacker', { testDeps });
    const rawToken = await issueDeletionToken(owner.id, testDeps);

    await expect(
      deleteAndAnonymizeTravelerAccount(
        { sessionUserId: attacker.id, rawToken },
        CTX,
        testDeps.deps,
      ),
    ).resolves.toBe('invalid');

    const ownerToken = await testPrisma.accountDeletionToken.findUniqueOrThrow({
      where: { tokenHash: hashToken(rawToken) },
    });
    expect(ownerToken.usedAt).toBeNull();
    for (const userId of [owner.id, attacker.id]) {
      const user = await testPrisma.user.findUniqueOrThrow({ where: { id: userId } });
      expect(user.status).toBe('ACTIVE');
      expect(user.deletedAt).toBeNull();
    }
  });

  it("만료된 토큰은 'expired' — 무변경", async () => {
    const testDeps = createTestDeps();
    const traveler = await createDeletionTraveler('confirm-expired', { testDeps });
    const rawToken = await issueDeletionToken(traveler.id, testDeps);
    await testPrisma.accountDeletionToken.update({
      where: { tokenHash: hashToken(rawToken) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    await expect(
      deleteAndAnonymizeTravelerAccount(
        { sessionUserId: traveler.id, rawToken },
        CTX,
        testDeps.deps,
      ),
    ).resolves.toBe('expired');
    const user = await testPrisma.user.findUniqueOrThrow({ where: { id: traveler.id } });
    expect(user.status).toBe('ACTIVE');
  });

  it("사용된 토큰 재제출은 'invalid'", async () => {
    const testDeps = createTestDeps();
    const traveler = await createDeletionTraveler('confirm-reuse', { testDeps });
    const rawToken = await issueDeletionToken(traveler.id, testDeps);

    await expect(
      deleteAndAnonymizeTravelerAccount(
        { sessionUserId: traveler.id, rawToken },
        CTX,
        testDeps.deps,
      ),
    ).resolves.toBe('deleted');
    await expect(
      deleteAndAnonymizeTravelerAccount(
        { sessionUserId: traveler.id, rawToken },
        CTX,
        testDeps.deps,
      ),
    ).resolves.toBe('invalid');
  });

  it("형식 불량 토큰은 'invalid' — DB 무접촉", async () => {
    const testDeps = createTestDeps();
    const traveler = await createDeletionTraveler('confirm-malformed', { testDeps });
    await expect(
      deleteAndAnonymizeTravelerAccount(
        { sessionUserId: traveler.id, rawToken: 'x'.repeat(10) },
        CTX,
        testDeps.deps,
      ),
    ).resolves.toBe('invalid');
  });

  it("요청 후 생긴 장애물은 'blocked' — 토큰이 소비되지 않아 해소 후 같은 토큰으로 성공한다", async () => {
    const testDeps = createTestDeps();
    const traveler = await createDeletionTraveler('confirm-blocked-retry', { testDeps });
    const rawToken = await issueDeletionToken(traveler.id, testDeps);

    // 요청과 확인 사이에 활성 예약이 생겼다
    const { bookingId } = await createBookingChain(traveler.id, { bookingStatus: 'CONFIRMED' });

    await expect(
      deleteAndAnonymizeTravelerAccount(
        { sessionUserId: traveler.id, rawToken },
        CTX,
        testDeps.deps,
      ),
    ).resolves.toBe('blocked');

    // 전체 rollback — 토큰 소비까지 되돌아간다
    const token = await testPrisma.accountDeletionToken.findUniqueOrThrow({
      where: { tokenHash: hashToken(rawToken) },
    });
    expect(token.usedAt).toBeNull();
    const user = await testPrisma.user.findUniqueOrThrow({ where: { id: traveler.id } });
    expect(user.status).toBe('ACTIVE');

    // 장애물 해소 후 같은 링크(TTL 내)로 재시도 성공
    await testPrisma.booking.update({ where: { id: bookingId }, data: { status: 'COMPLETED' } });
    await expect(
      deleteAndAnonymizeTravelerAccount(
        { sessionUserId: traveler.id, rawToken },
        CTX,
        testDeps.deps,
      ),
    ).resolves.toBe('deleted');
  });
});

describe('탈퇴 후 인증 차단·이메일 재사용', () => {
  it('기존 JWT 세션은 다음 session 조회에서 즉시 무효화되고 쿠키가 제거된다', async () => {
    const testDeps = createTestDeps();
    const traveler = await createDeletionTraveler('confirm-jwt', { testDeps });

    // 실제 Auth.js handler로 로그인 — production deps는 setup.ts가 test DB로 고정
    const jar = new CookieJar();
    await signInWithCredentials(jar, traveler.email, traveler.password);
    const active = await fetchSession(jar);
    expect(sessionUser(active.body)?.email).toBe(traveler.email);

    const rawToken = await issueDeletionToken(traveler.id, testDeps);
    await expect(
      deleteAndAnonymizeTravelerAccount(
        { sessionUserId: traveler.id, rawToken },
        CTX,
        testDeps.deps,
      ),
    ).resolves.toBe('deleted');

    // 같은 쿠키로 세션 조회 → jwt callback이 status=DELETED를 보고 세션을 무효화한다
    const invalidated = await fetchSession(jar);
    expect(sessionUser(invalidated.body)).toBeNull();
    expect(jar.has(SESSION_COOKIE)).toBe(false);
  });

  it('기존 credentials(원 이메일+비밀번호)로 다시 로그인할 수 없다', async () => {
    const testDeps = createTestDeps();
    const traveler = await createDeletionTraveler('confirm-relogin', { testDeps });
    const rawToken = await issueDeletionToken(traveler.id, testDeps);
    await deleteAndAnonymizeTravelerAccount(
      { sessionUserId: traveler.id, rawToken },
      CTX,
      testDeps.deps,
    );

    await expect(
      loginWithCredentials(
        { email: traveler.email, password: traveler.password },
        CTX,
        createTestDeps().deps,
      ),
    ).resolves.toBeNull();
  });

  it('원 이메일로 즉시 재가입할 수 있고, 새 User id는 과거 기록과 연결되지 않는다', async () => {
    const testDeps = createTestDeps();
    const traveler = await createDeletionTraveler('confirm-reuse-email', { testDeps });
    const { bookingId } = await createBookingChain(traveler.id, { bookingStatus: 'COMPLETED' });
    const rawToken = await issueDeletionToken(traveler.id, testDeps);
    await deleteAndAnonymizeTravelerAccount(
      { sessionUserId: traveler.id, rawToken },
      CTX,
      testDeps.deps,
    );

    // commit 직후 같은 이메일로 신규 credentials 가입
    const fresh = createTestDeps();
    const result = await registerUser(registerInput(traveler.email), TEST_CTX, fresh.deps);
    expect(result.outcome).toBe('created');

    const newUser = await testPrisma.user.findUniqueOrThrow({
      where: { email: traveler.email },
    });
    trackUserId(newUser.id);
    expect(newUser.id).not.toBe(traveler.id);
    expect(newUser.status).toBe('ACTIVE');

    // 과거 예약은 tombstone id에 남고, 새 사용자에게는 아무 기록도 연결되지 않는다
    const booking = await testPrisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(booking.travelerId).toBe(traveler.id);
    expect(await testPrisma.booking.count({ where: { travelerId: newUser.id } })).toBe(0);
    expect(await testPrisma.consentRecord.count({ where: { userId: newUser.id } })).toBe(3);
    const tombstone = await testPrisma.user.findUniqueOrThrow({ where: { id: traveler.id } });
    expect(tombstone.status).toBe('DELETED');
  });

  it.each([['google'], ['kakao']] as const)(
    '%s: 탈퇴한 사용자의 provider identity로 재로그인하면 새 User가 생성된다',
    async (provider) => {
      const app = createOAuthTestApp();
      const email = testEmail(`confirm-oauth-${provider}`);
      const sub = `del-${provider}-sub-1`;

      // 1) OAuth 신규 가입
      const firstJar = new CookieJar();
      const firstLogin =
        provider === 'google'
          ? await performGoogleLogin(app, firstJar, {
              sub,
              email,
              email_verified: true,
              name: 'OAuth Traveler',
            })
          : await performKakaoLogin(app, firstJar, {
              id: 987654,
              email,
              is_email_valid: true,
              is_email_verified: true,
              nickname: 'OAuth Traveler',
            });
      expectSuccessRedirect(firstLogin);
      const original = await testPrisma.user.findUniqueOrThrow({ where: { email } });
      trackUserId(original.id);
      expect(await testPrisma.account.count({ where: { userId: original.id } })).toBe(1);

      // 2) 탈퇴 (OAuth 사용자 — passwordHash 없음)
      const testDeps = createTestDeps();
      const rawToken = await issueDeletionToken(original.id, testDeps);
      await expect(
        deleteAndAnonymizeTravelerAccount(
          { sessionUserId: original.id, rawToken },
          CTX,
          testDeps.deps,
        ),
      ).resolves.toBe('deleted');
      expect(await testPrisma.account.count({ where: { userId: original.id } })).toBe(0);

      // 3) 같은 provider identity(sub)·같은 이메일로 재로그인 → 신규 가입으로 처리
      const secondJar = new CookieJar();
      const secondLogin =
        provider === 'google'
          ? await performGoogleLogin(app, secondJar, { sub, email, email_verified: true })
          : await performKakaoLogin(app, secondJar, {
              id: 987654,
              email,
              is_email_valid: true,
              is_email_verified: true,
            });
      expectSuccessRedirect(secondLogin);

      const recreated = await testPrisma.user.findUniqueOrThrow({ where: { email } });
      trackUserId(recreated.id);
      expect(recreated.id).not.toBe(original.id);
      expect(await testPrisma.account.count({ where: { userId: recreated.id } })).toBe(1);
      // tombstone은 그대로 — 과거 identity와 신규 identity가 분리된다
      const tombstone = await testPrisma.user.findUniqueOrThrow({ where: { id: original.id } });
      expect(tombstone.status).toBe('DELETED');
      expect(tombstone.email).toBe(tombstoneEmailFor(original.id));
    },
  );
});

describe('deleteAndAnonymizeTravelerAccount — rate limit·형식 검증 순서', () => {
  it('IP 한도가 발동한다', async () => {
    const { deps } = createTestDeps({ limiterMax: { deletionConfirmByIp: 1 } });
    const ctx = { ipAddress: '203.0.113.92' };
    await expect(
      deleteAndAnonymizeTravelerAccount(
        { sessionUserId: 'nobody', rawToken: generateRawToken() },
        ctx,
        deps,
      ),
    ).resolves.toBe('invalid');
    await expect(
      deleteAndAnonymizeTravelerAccount(
        { sessionUserId: 'nobody', rawToken: generateRawToken() },
        ctx,
        deps,
      ),
    ).rejects.toMatchObject({ code: ERROR_CODES.RATE_LIMITED });
  });

  it('token 한도는 같은 토큰만 차단하고 다른 토큰은 허용한다', async () => {
    const { deps } = createTestDeps({ limiterMax: { deletionConfirmByToken: 1 } });
    const hammered = generateRawToken();
    await expect(
      deleteAndAnonymizeTravelerAccount({ sessionUserId: 'nobody', rawToken: hammered }, CTX, deps),
    ).resolves.toBe('invalid');
    await expect(
      deleteAndAnonymizeTravelerAccount({ sessionUserId: 'nobody', rawToken: hammered }, CTX, deps),
    ).rejects.toMatchObject({ code: ERROR_CODES.RATE_LIMITED });
    await expect(
      deleteAndAnonymizeTravelerAccount(
        { sessionUserId: 'nobody', rawToken: generateRawToken() },
        CTX,
        deps,
      ),
    ).resolves.toBe('invalid');
  });

  it('형식 불량 토큰은 token limiter·DB 접근 전에 거부된다', async () => {
    const { deps } = createTestDeps({ limiterMax: { deletionConfirmByToken: 1 } });
    // 형식 검증이 token limiter보다 앞서므로, 같은 불량 문자열을 반복해도
    // RATE_LIMITED가 아니라 계속 'invalid'다 (limiter 키가 소비되지 않는다는 증명)
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await expect(
        deleteAndAnonymizeTravelerAccount(
          { sessionUserId: 'nobody', rawToken: 'malformed-token' },
          CTX,
          deps,
        ),
      ).resolves.toBe('invalid');
    }
  });
});

describe('confirmDeletionCore — cookie 수명·로그 비민감화', () => {
  const DEV_COOKIE = deletionTokenCookieName(false);

  /** name → value 맵 기반 fake store — clear spec(두 이름 만료)까지 기록한다 */
  function fakeCookieStore(initialToken?: string) {
    const jar = new Map<string, string>();
    if (initialToken !== undefined) {
      jar.set(DEV_COOKIE, initialToken);
    }
    const deletions: DeletionCookieClearSpec[] = [];
    const store: DeletionCookieStore = {
      get: (name) => {
        const value = jar.get(name);
        return value === undefined ? undefined : { value };
      },
      delete: (spec) => {
        deletions.push(spec);
        jar.delete(spec.name);
      },
    };
    return { store, jar, deletions };
  }

  const COOKIE_PATH = '/settings/account/delete';

  /** clear가 일반·__Secure- 이름을 모두 같은 Path에서 Max-Age=0으로 만료했는지 검증 */
  function expectBothNamesCleared(deletions: DeletionCookieClearSpec[]) {
    expect(deletions.map((spec) => spec.name).sort()).toEqual(
      ['__Secure-account-deletion-token', 'account-deletion-token'].sort(),
    );
    for (const spec of deletions) {
      expect(spec.maxAge).toBe(0);
      expect(spec.path).toBe(COOKIE_PATH);
      expect(spec.secure).toBe(spec.name.startsWith('__Secure-'));
    }
  }

  it('성공 시 탈퇴 후 두 이름의 cookie를 모두 제거한다', async () => {
    const testDeps = createTestDeps();
    const traveler = await createDeletionTraveler('core-success', { testDeps });
    const rawToken = await issueDeletionToken(traveler.id, testDeps);
    const { store, jar, deletions } = fakeCookieStore(rawToken);

    const outcome = await confirmDeletionCore(
      {
        sessionUserId: traveler.id,
        ipAddress: TEST_IP,
        cookieStore: store,
        cookiePath: COOKIE_PATH,
        isProduction: false,
      },
      testDeps.deps,
    );

    expect(outcome).toEqual({ kind: 'deleted' });
    expect(jar.has(DEV_COOKIE)).toBe(false);
    expectBothNamesCleared(deletions);
  });

  it('production read는 __Secure- cookie를 사용한다 (일반 cookie는 무시)', async () => {
    const testDeps = createTestDeps();
    const traveler = await createDeletionTraveler('core-prod-read', { testDeps });
    const rawToken = await issueDeletionToken(traveler.id, testDeps);
    const { store, jar } = fakeCookieStore();
    jar.set(deletionTokenCookieName(true), rawToken);
    // 일반 이름에는 무효 값 — production read가 이것을 쓰면 invalid가 된다
    jar.set(DEV_COOKIE, generateRawToken());

    const outcome = await confirmDeletionCore(
      {
        sessionUserId: traveler.id,
        ipAddress: TEST_IP,
        cookieStore: store,
        cookiePath: COOKIE_PATH,
        isProduction: true,
      },
      testDeps.deps,
    );
    expect(outcome).toEqual({ kind: 'deleted' });
  });

  it('invalid(미발급 토큰) 결과에서도 cookie를 제거한다', async () => {
    const testDeps = createTestDeps();
    const traveler = await createDeletionTraveler('core-invalid', { testDeps });
    const { store, jar } = fakeCookieStore(generateRawToken());

    const outcome = await confirmDeletionCore(
      {
        sessionUserId: traveler.id,
        ipAddress: TEST_IP,
        cookieStore: store,
        cookiePath: COOKIE_PATH,
        isProduction: false,
      },
      testDeps.deps,
    );

    expect(outcome).toEqual({ kind: 'result', status: 'invalid' });
    expect(jar.has(DEV_COOKIE)).toBe(false);
  });

  it('expired 결과에서도 cookie를 제거한다', async () => {
    const testDeps = createTestDeps();
    const traveler = await createDeletionTraveler('core-expired', { testDeps });
    const rawToken = await issueDeletionToken(traveler.id, testDeps);
    await testPrisma.accountDeletionToken.update({
      where: { tokenHash: hashToken(rawToken) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const { store, jar } = fakeCookieStore(rawToken);

    const outcome = await confirmDeletionCore(
      {
        sessionUserId: traveler.id,
        ipAddress: TEST_IP,
        cookieStore: store,
        cookiePath: COOKIE_PATH,
        isProduction: false,
      },
      testDeps.deps,
    );
    expect(outcome).toEqual({ kind: 'result', status: 'expired' });
    expect(jar.has(DEV_COOKIE)).toBe(false);
  });

  it('blocked 결과에서도 cookie를 제거한다', async () => {
    const testDeps = createTestDeps();
    const traveler = await createDeletionTraveler('core-blocked', { testDeps });
    const rawToken = await issueDeletionToken(traveler.id, testDeps);
    await createBookingChain(traveler.id, { bookingStatus: 'IN_PROGRESS' });
    const { store, jar } = fakeCookieStore(rawToken);

    const outcome = await confirmDeletionCore(
      {
        sessionUserId: traveler.id,
        ipAddress: TEST_IP,
        cookieStore: store,
        cookiePath: COOKIE_PATH,
        isProduction: false,
      },
      testDeps.deps,
    );
    expect(outcome).toEqual({ kind: 'result', status: 'blocked' });
    expect(jar.has(DEV_COOKIE)).toBe(false);
  });

  it('내부 오류(error): cookie 제거 + 고정 문구만 기록 — token·이메일·URL 비노출', async () => {
    const testDeps = createTestDeps();
    const traveler = await createDeletionTraveler('core-error', { testDeps });
    const rawToken = await issueDeletionToken(traveler.id, testDeps);
    const { store, jar, deletions } = fakeCookieStore(rawToken);

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      // 최악의 경우: 주입 오류 메시지에 raw token·이메일·confirm URL이 전부 포함
      const hostileError = new Error(
        `boom to=${traveler.email} token=${rawToken} url=https://x/settings/account/delete/confirm?token=${rawToken}`,
      );
      const outcome = await confirmDeletionCore(
        {
          sessionUserId: traveler.id,
          ipAddress: TEST_IP,
          cookieStore: store,
          cookiePath: COOKIE_PATH,
          isProduction: false,
        },
        testDeps.deps,
        { afterTokenConsume: () => Promise.reject(hostileError) },
      );
      expect(outcome).toEqual({ kind: 'result', status: 'error' });
      expect(jar.has(DEV_COOKIE)).toBe(false);
      expectBothNamesCleared(deletions);

      const output = errorSpy.mock.calls
        .flat()
        .map((value) =>
          value instanceof Error ? `${value.message}\n${value.stack}` : String(value),
        )
        .join('\n');
      expect(output).not.toContain(rawToken);
      expect(output).not.toContain(traveler.email);
      expect(output).not.toContain('token=');
      expect(output).not.toContain('/settings/account/delete/confirm');
      expect(output).not.toContain('boom');
      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy).toHaveBeenCalledWith('[users] 계정 탈퇴 처리 실패');
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('rate limit에서는 cookie를 유지한다 — 잠시 후 같은 링크로 재시도 가능', async () => {
    const testDeps = createTestDeps({ limiterMax: { deletionConfirmByIp: 1 } });
    const traveler = await createDeletionTraveler('core-ratelimit', { testDeps });
    // IP 한도(1)를 미리 소진해 다음 confirm이 RATE_LIMITED가 되게 한다
    await testDeps.deps.rateLimiters.deletionConfirmByIp.limit(limiterKey(TEST_IP));
    const { store, jar, deletions } = fakeCookieStore(generateRawToken());

    const outcome = await confirmDeletionCore(
      {
        sessionUserId: traveler.id,
        ipAddress: TEST_IP,
        cookieStore: store,
        cookiePath: COOKIE_PATH,
        isProduction: false,
      },
      testDeps.deps,
    );
    expect(outcome.kind).toBe('rate-limited');
    expect(jar.has(DEV_COOKIE)).toBe(true);
    expect(deletions).toHaveLength(0);
  });

  it("cookie가 없으면 'invalid' 결과로 일반화한다", async () => {
    const testDeps = createTestDeps();
    const traveler = await createDeletionTraveler('core-missing', { testDeps });
    const { store } = fakeCookieStore();

    const outcome = await confirmDeletionCore(
      {
        sessionUserId: traveler.id,
        ipAddress: TEST_IP,
        cookieStore: store,
        cookiePath: COOKIE_PATH,
        isProduction: false,
      },
      testDeps.deps,
    );
    expect(outcome).toEqual({ kind: 'result', status: 'invalid' });
  });
});
