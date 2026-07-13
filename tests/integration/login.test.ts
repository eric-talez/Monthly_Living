import bcrypt from 'bcryptjs';
import { afterAll, describe, expect, it } from 'vitest';

import { ERROR_CODES } from '@/lib/errors';
import { getSessionClaims, loginWithCredentials } from '@/modules/auth/service';

import { TEST_PASSWORD, userSeeds } from '../../prisma/seed-data/users';
import { cleanupOwnData, disconnect, testEmail, testPrisma } from './helpers/db';
import { createTestDeps } from './helpers/deps';
import { createRegisteredUser, TEST_IP } from './helpers/users';

afterAll(async () => {
  await cleanupOwnData();
  await disconnect();
});

const CTX = { ipAddress: TEST_IP };

describe('loginWithCredentials', () => {
  it('이메일 미인증 사용자는 로그인할 수 없고 실패가 LoginAttempt에 기록된다', async () => {
    const { email, password, testDeps } = await createRegisteredUser('login-unverified', {
      verify: false,
    });

    await expect(loginWithCredentials({ email, password }, CTX, testDeps.deps)).resolves.toBeNull();

    const attempts = await testPrisma.loginAttempt.findMany({ where: { email } });
    expect(attempts).toHaveLength(1);
    expect(attempts[0].succeeded).toBe(false);
    expect(attempts[0].ipAddress).toBe(TEST_IP);
  });

  it('인증 완료 사용자는 로그인되고 성공이 기록된다 (raw hash 미노출)', async () => {
    const { email, password, testDeps } = await createRegisteredUser('login-ok');

    const user = await loginWithCredentials({ email, password }, CTX, testDeps.deps);
    expect(user).not.toBeNull();
    expect(user?.email).toBe(email);
    expect(user?.role).toBe('TRAVELER');
    expect(user?.status).toBe('ACTIVE');
    // credentialVersion은 HMAC digest다 — bcrypt hash 원문이 아니어야 한다
    expect(user?.credentialVersion).toMatch(/^[0-9a-f]{64}$/);
    expect(user?.credentialVersion).not.toContain('$2');
    expect(Object.values(user ?? {})).not.toContainEqual(expect.stringMatching(/^\$2[aby]\$/));

    const attempts = await testPrisma.loginAttempt.findMany({ where: { email } });
    expect(attempts.map((a) => a.succeeded)).toEqual([true]);
  });

  it('잘못된 비밀번호는 null + 실패 기록', async () => {
    const { email, testDeps } = await createRegisteredUser('login-wrongpw');

    await expect(
      loginWithCredentials({ email, password: 'Wrong1234!' }, CTX, testDeps.deps),
    ).resolves.toBeNull();

    const attempts = await testPrisma.loginAttempt.findMany({ where: { email } });
    expect(attempts.map((a) => a.succeeded)).toEqual([false]);
  });

  it('존재하지 않는 이메일도 동일하게 null을 돌려준다 (존재 여부 비노출)', async () => {
    const { deps } = createTestDeps();
    const missing = testEmail('login-missing');

    await expect(
      loginWithCredentials({ email: missing, password: 'Whatever1!' }, CTX, deps),
    ).resolves.toBeNull();

    // 미존재 이메일 시도도 감사 기록에는 남는다 (FK 없는 LoginAttempt)
    const attempts = await testPrisma.loginAttempt.findMany({ where: { email: missing } });
    expect(attempts.map((a) => a.succeeded)).toEqual([false]);
  });

  it('소셜 전용 계정(passwordHash null)은 Credentials 로그인 불가', async () => {
    const { deps } = createTestDeps();
    const email = testEmail('login-social-only');
    await testPrisma.user.create({
      data: { email, passwordHash: null, emailVerified: new Date() },
    });

    await expect(
      loginWithCredentials({ email, password: 'Anything1!' }, CTX, deps),
    ).resolves.toBeNull();
  });

  it('SUSPENDED / DELETED 사용자는 로그인할 수 없다', async () => {
    const suspended = await createRegisteredUser('login-suspended');
    await testPrisma.user.update({
      where: { email: suspended.email },
      data: { status: 'SUSPENDED' },
    });
    await expect(
      loginWithCredentials(
        { email: suspended.email, password: suspended.password },
        CTX,
        suspended.testDeps.deps,
      ),
    ).resolves.toBeNull();

    const deleted = await createRegisteredUser('login-deleted');
    await testPrisma.user.update({
      where: { email: deleted.email },
      data: { status: 'DELETED', deletedAt: new Date() },
    });
    await expect(
      loginWithCredentials(
        { email: deleted.email, password: deleted.password },
        CTX,
        deleted.testDeps.deps,
      ),
    ).resolves.toBeNull();
  });

  it('email 기준 rate limit 발동 시 RATE_LIMITED가 던져지고 LoginAttempt는 늘지 않는다', async () => {
    const { email, testDeps } = await createRegisteredUser('login-rl-email', {
      testDeps: createTestDeps({ limiterMax: { loginByEmail: 3 } }),
    });

    for (let i = 0; i < 3; i += 1) {
      await loginWithCredentials({ email, password: 'Wrong1234!' }, CTX, testDeps.deps);
    }
    const before = await testPrisma.loginAttempt.count({ where: { email } });
    expect(before).toBe(3);

    await expect(
      loginWithCredentials({ email, password: 'Wrong1234!' }, CTX, testDeps.deps),
    ).rejects.toMatchObject({ code: ERROR_CODES.RATE_LIMITED });

    // 차단된 시도는 감사 기록 대상이 아니다 (쓰기 증폭 방지 — 결정 문서)
    const after = await testPrisma.loginAttempt.count({ where: { email } });
    expect(after).toBe(3);
  });

  it('IP 기준 rate limit은 이메일이 달라도 발동한다', async () => {
    const { deps } = createTestDeps({ limiterMax: { loginByIp: 2 } });
    const ctx = { ipAddress: '203.0.113.55' };

    await loginWithCredentials(
      { email: testEmail('login-rl-ip-1'), password: 'Wrong1234!' },
      ctx,
      deps,
    );
    await loginWithCredentials(
      { email: testEmail('login-rl-ip-2'), password: 'Wrong1234!' },
      ctx,
      deps,
    );
    await expect(
      loginWithCredentials(
        { email: testEmail('login-rl-ip-3'), password: 'Wrong1234!' },
        ctx,
        deps,
      ),
    ).rejects.toMatchObject({ code: ERROR_CODES.RATE_LIMITED });
  });

  it('seed 동등성: seed와 동일한 입력·cost로 만든 계정이 TEST_PASSWORD로 로그인된다', async () => {
    // seed 계정을 test DB에 literal 이메일로 재현하지 않는다 — runId prefix 이메일에
    // prisma/seed.ts와 동일한 방식(hashSync, cost 12)·동일한 필드로 재현해 검증한다.
    // 실제 traveler@test.com 로그인은 dev 서버 수동 브라우저 검증에서 확인한다.
    const { deps } = createTestDeps();
    const seed = userSeeds.find((u) => u.email === 'traveler@test.com');
    expect(seed).toBeDefined();

    const email = testEmail('seed-equivalent');
    await testPrisma.user.create({
      data: {
        email,
        role: seed!.role,
        name: seed!.name,
        fullName: seed!.fullName,
        preferredLanguage: seed!.preferredLanguage,
        country: seed!.country,
        timezone: seed!.timezone,
        passwordHash: bcrypt.hashSync(TEST_PASSWORD, 12),
        emailVerified: new Date(),
      },
    });

    const user = await loginWithCredentials({ email, password: TEST_PASSWORD }, CTX, deps);
    expect(user).not.toBeNull();
    expect(user?.role).toBe('TRAVELER');
  });
});

describe('getSessionClaims', () => {
  it('ACTIVE 사용자의 role/status/credentialDigest를 돌려준다', async () => {
    const { email, testDeps } = await createRegisteredUser('claims-active');
    const user = await testPrisma.user.findUniqueOrThrow({ where: { email } });

    const claims = await getSessionClaims(user.id, testDeps.deps);
    expect(claims).toMatchObject({ role: 'TRAVELER', status: 'ACTIVE', deletedAt: null });
    expect(claims?.credentialDigest).toMatch(/^[0-9a-f]{64}$/);
  });

  it('SUSPENDED/DELETED/미존재 사용자를 jwt callback이 차단할 수 있는 형태로 돌려준다', async () => {
    const { email, testDeps } = await createRegisteredUser('claims-blocked');
    const user = await testPrisma.user.findUniqueOrThrow({ where: { email } });

    await testPrisma.user.update({ where: { id: user.id }, data: { status: 'SUSPENDED' } });
    await expect(getSessionClaims(user.id, testDeps.deps)).resolves.toMatchObject({
      status: 'SUSPENDED',
    });

    await testPrisma.user.update({
      where: { id: user.id },
      data: { status: 'DELETED', deletedAt: new Date() },
    });
    const deletedClaims = await getSessionClaims(user.id, testDeps.deps);
    expect(deletedClaims?.status).toBe('DELETED');
    expect(deletedClaims?.deletedAt).not.toBeNull();

    await expect(getSessionClaims('nonexistent-user-id', testDeps.deps)).resolves.toBeNull();
  });
});
