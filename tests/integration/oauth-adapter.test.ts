import { afterAll, describe, expect, it } from 'vitest';

import { createOAuthAdapter, OAuthAdapterMutationBlockedError } from '@/modules/auth/adapter';

import { disconnect, testPrisma } from './helpers/db';

/**
 * adapter fail-closed 검증 — 신규 identity는 signIn callback의
 * ensureOAuthIdentity() transaction에서만 생성된다. adapter mutation이 직접
 * 호출되면(설정 회귀·core 동작 변화) 부분 상태를 만들지 않고 즉시 실패해야 한다.
 * 정상 flow가 이 mutation들을 지나지 않는다는 lifecycle 증명은
 * oauth.test.ts의 성공 시나리오가 담당한다 (호출됐다면 flow가 실패했을 것).
 */

const adapter = createOAuthAdapter(testPrisma);

afterAll(async () => {
  await disconnect();
});

describe('createOAuthAdapter — mutation fail-closed', () => {
  it('createUser 직접 호출은 차단된다 (User 미생성)', async () => {
    const before = await testPrisma.user.count();
    await expect(
      adapter.createUser!({
        id: 'ignored',
        email: 'blocked@example.com',
        emailVerified: null,
      }),
    ).rejects.toThrow(OAuthAdapterMutationBlockedError);
    expect(await testPrisma.user.count()).toBe(before);
    expect(await testPrisma.user.count({ where: { email: 'blocked@example.com' } })).toBe(0);
  });

  it('linkAccount 직접 호출은 차단된다 (Account 미생성)', async () => {
    await expect(
      adapter.linkAccount!({
        userId: 'any-user',
        type: 'oidc',
        provider: 'google',
        providerAccountId: 'blocked-sub',
      }),
    ).rejects.toThrow(OAuthAdapterMutationBlockedError);
    expect(
      await testPrisma.account.count({
        where: { provider: 'google', providerAccountId: 'blocked-sub' },
      }),
    ).toBe(0);
  });

  it('deleteUser/unlinkAccount도 차단된다 (adapter 경유 삭제 경로 없음)', async () => {
    await expect(adapter.deleteUser!('any-user')).rejects.toThrow(OAuthAdapterMutationBlockedError);
    await expect(
      adapter.unlinkAccount!({ provider: 'google', providerAccountId: 'any' }),
    ).rejects.toThrow(OAuthAdapterMutationBlockedError);
  });

  it('오류 메시지에 이메일·토큰 등 민감 값이 없다', async () => {
    let error: unknown;
    try {
      await adapter.createUser!({ id: 'x', email: 'sensitive@example.com', emailVerified: null });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(OAuthAdapterMutationBlockedError);
    expect((error as Error).message).not.toContain('sensitive@example.com');
  });

  it('조회 메서드는 그대로 동작한다 (core lifecycle에 필요)', async () => {
    await expect(
      adapter.getUserByAccount!({ provider: 'google', providerAccountId: 'no-such-account' }),
    ).resolves.toBeNull();
  });
});
