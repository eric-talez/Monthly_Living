import { afterAll, describe, expect, it } from 'vitest';

import { loginWithCredentials } from '@/modules/auth/service';
import { hashToken } from '@/modules/auth/tokens';
import {
  deleteAndAnonymizeTravelerAccount,
  requestAccountDeletion,
  tombstoneEmailFor,
  type AccountDeletionHooks,
} from '@/modules/users/account-deletion';

import { cleanupOwnData, disconnect, testPrisma } from './helpers/db';
import { createTestDeps, extractTokenFromEmail, type TestDeps } from './helpers/deps';
import {
  cleanupFixtures,
  createDeletionTraveler,
  createFavorites,
  createNotificationWithDelivery,
  createOAuthAccountRow,
  createBookingChain,
  trackUserId,
} from './helpers/fixtures';
import { TEST_CTX, TEST_IP } from './helpers/users';

afterAll(async () => {
  await cleanupFixtures();
  await cleanupOwnData();
  await disconnect();
});

const CTX = { ipAddress: TEST_IP };

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

/** rollback 검증용 상태 스냅샷 — 사용자 행 전체 + 소유 데이터 카운트 */
async function snapshotUserState(userId: string) {
  const [user, counts] = await Promise.all([
    testPrisma.user.findUnique({ where: { id: userId } }),
    Promise.all([
      testPrisma.account.count({ where: { userId } }),
      testPrisma.travelerProfile.count({ where: { userId } }),
      testPrisma.programFavorite.count({ where: { userId } }),
      testPrisma.expertFavorite.count({ where: { userId } }),
      testPrisma.notification.count({ where: { userId } }),
      testPrisma.emailVerificationToken.count({ where: { userId } }),
      testPrisma.accountDeletionToken.count({ where: { userId, usedAt: null } }),
    ]),
  ]);
  return { user, counts };
}

describe('실패 주입 — 4개 지점 전부에서 전체 rollback', () => {
  const hookNames: Array<keyof AccountDeletionHooks> = [
    'afterTokenConsume',
    'afterAccountDelete',
    'beforeUserAnonymize',
    'beforeCommit',
  ];

  it.each(hookNames.map((name) => [name] as const))(
    '%s에서 실패하면 토큰 소비를 포함한 모든 변경이 원상 복구된다',
    async (hookName) => {
      const testDeps = createTestDeps();
      const traveler = await createDeletionTraveler(`atomic-${hookName.toLowerCase()}`, {
        testDeps,
      });
      await testPrisma.travelerProfile.create({ data: { userId: traveler.id } });
      const { context } = await createBookingChain(traveler.id, { bookingStatus: 'COMPLETED' });
      await createFavorites(traveler.id, context);
      await createNotificationWithDelivery(traveler.id);
      await createOAuthAccountRow(traveler.id, 'google');

      const rawToken = await issueDeletionToken(traveler.id, testDeps);
      const before = await snapshotUserState(traveler.id);
      expect(before.user?.status).toBe('ACTIVE');

      const hooks: AccountDeletionHooks = {
        [hookName]: () => {
          throw new Error('injected-tx-failure');
        },
      };
      await expect(
        deleteAndAnonymizeTravelerAccount(
          { sessionUserId: traveler.id, rawToken },
          CTX,
          testDeps.deps,
          hooks,
        ),
      ).rejects.toThrow('injected-tx-failure');

      // 사용자 행·소유 데이터·토큰 상태가 실패 전과 완전히 같다
      const after = await snapshotUserState(traveler.id);
      expect(after.user).toEqual(before.user);
      expect(after.counts).toEqual(before.counts);
      const token = await testPrisma.accountDeletionToken.findUniqueOrThrow({
        where: { tokenHash: hashToken(rawToken) },
      });
      expect(token.usedAt).toBeNull();

      // 주입 제거 후 같은 토큰으로 재시도하면 성공한다
      await expect(
        deleteAndAnonymizeTravelerAccount(
          { sessionUserId: traveler.id, rawToken },
          CTX,
          testDeps.deps,
        ),
      ).resolves.toBe('deleted');
      const tombstone = await testPrisma.user.findUniqueOrThrow({ where: { id: traveler.id } });
      expect(tombstone.email).toBe(tombstoneEmailFor(traveler.id));
    },
  );
});

describe('tombstone 이메일 unique 충돌', () => {
  it('P2002 발생 시 전체 rollback되고, 충돌 해소 후 같은 토큰으로 성공한다', async () => {
    const testDeps = createTestDeps();
    const traveler = await createDeletionTraveler('atomic-squat', { testDeps });
    await createOAuthAccountRow(traveler.id, 'kakao');

    // tombstone 이메일을 선점한 계정을 인위적으로 만든다
    const squatter = await testPrisma.user.create({
      data: { email: tombstoneEmailFor(traveler.id) },
      select: { id: true },
    });
    trackUserId(squatter.id);

    const rawToken = await issueDeletionToken(traveler.id, testDeps);
    const before = await snapshotUserState(traveler.id);

    await expect(
      deleteAndAnonymizeTravelerAccount(
        { sessionUserId: traveler.id, rawToken },
        CTX,
        testDeps.deps,
      ),
    ).rejects.toMatchObject({ code: 'P2002' });

    // 충돌 실패 후 무변경 — Account·토큰이 부분 삭제되지 않았다
    const after = await snapshotUserState(traveler.id);
    expect(after.user).toEqual(before.user);
    expect(after.counts).toEqual(before.counts);
    const token = await testPrisma.accountDeletionToken.findUniqueOrThrow({
      where: { tokenHash: hashToken(rawToken) },
    });
    expect(token.usedAt).toBeNull();

    // 선점 계정 제거 후 같은 토큰으로 성공
    await testPrisma.user.delete({ where: { id: squatter.id } });
    await expect(
      deleteAndAnonymizeTravelerAccount(
        { sessionUserId: traveler.id, rawToken },
        CTX,
        testDeps.deps,
      ),
    ).resolves.toBe('deleted');
  });
});

describe('동시성', () => {
  it('같은 토큰 동시 제출은 정확히 한 요청만 성공한다', async () => {
    const testDeps = createTestDeps();
    const traveler = await createDeletionTraveler('atomic-race', { testDeps });
    await createOAuthAccountRow(traveler.id, 'google');
    const rawToken = await issueDeletionToken(traveler.id, testDeps);

    const [first, second] = await Promise.all([
      deleteAndAnonymizeTravelerAccount(
        { sessionUserId: traveler.id, rawToken },
        CTX,
        testDeps.deps,
      ),
      deleteAndAnonymizeTravelerAccount(
        { sessionUserId: traveler.id, rawToken },
        CTX,
        testDeps.deps,
      ),
    ]);

    expect([first, second].filter((result) => result === 'deleted')).toHaveLength(1);
    expect([first, second].filter((result) => result === 'invalid')).toHaveLength(1);

    // 최종 상태는 단일 tombstone — 부분 상태 없음
    const user = await testPrisma.user.findUniqueOrThrow({ where: { id: traveler.id } });
    expect(user.status).toBe('DELETED');
    expect(user.email).toBe(tombstoneEmailFor(traveler.id));
    expect(await testPrisma.account.count({ where: { userId: traveler.id } })).toBe(0);
  });

  it('탈퇴-로그인 race: commit 이후에는 새 세션(로그인)이 불가능하다', async () => {
    const testDeps = createTestDeps();
    const traveler = await createDeletionTraveler('atomic-login-race', { testDeps });
    const rawToken = await issueDeletionToken(traveler.id, testDeps);
    const loginDeps = createTestDeps();

    const [deletionResult] = await Promise.all([
      deleteAndAnonymizeTravelerAccount(
        { sessionUserId: traveler.id, rawToken },
        CTX,
        testDeps.deps,
      ),
      // race 상대 — 성공/실패는 인터리빙에 따라 다르며 어느 쪽이든 무방하다
      loginWithCredentials(
        { email: traveler.email, password: traveler.password },
        CTX,
        loginDeps.deps,
      ),
    ]);
    expect(deletionResult).toBe('deleted');

    // commit 이후에는 원 자격 증명 로그인 불가 + 세션 클레임 기준으로도 무효
    await expect(
      loginWithCredentials(
        { email: traveler.email, password: traveler.password },
        CTX,
        createTestDeps().deps,
      ),
    ).resolves.toBeNull();
    const user = await testPrisma.user.findUniqueOrThrow({ where: { id: traveler.id } });
    expect(user.status === 'DELETED' || user.deletedAt !== null).toBe(true);
  });
});
