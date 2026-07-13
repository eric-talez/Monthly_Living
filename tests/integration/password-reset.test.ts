import { afterAll, describe, expect, it } from 'vitest';

import { ERROR_CODES } from '@/lib/errors';
import { PASSWORD_RESET_TOKEN_TTL_MS } from '@/modules/auth/constants';
import { loginWithCredentials, requestPasswordReset, resetPassword } from '@/modules/auth/service';
import { hashToken } from '@/modules/auth/tokens';

import { cleanupOwnData, disconnect, testEmail, testPrisma } from './helpers/db';
import { createTestDeps, extractTokenFromEmail } from './helpers/deps';
import { createRegisteredUser, TEST_CTX, TEST_IP } from './helpers/users';

afterAll(async () => {
  await cleanupOwnData();
  await disconnect();
});

const CTX = { ipAddress: TEST_IP };

describe('requestPasswordReset', () => {
  it('가입 여부와 무관하게 동일한 응답(성공)을 돌려준다 — 메일 발송 여부만 다르다', async () => {
    const { email } = await createRegisteredUser('reset-request-existing');
    const { deps, sentEmails } = createTestDeps();

    const existing = await requestPasswordReset({ email }, TEST_CTX, deps);
    const missing = await requestPasswordReset(
      { email: testEmail('reset-request-missing') },
      TEST_CTX,
      deps,
    );

    // 반환 형태 동일 (둘 다 void) — 존재 여부는 응답으로 구분 불가
    expect(existing).toBeUndefined();
    expect(missing).toBeUndefined();

    // 실제 메일은 존재 계정에만 발송된다
    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0].to).toBe(email);
  });

  it('소셜 전용 계정(passwordHash null)은 메일 없이 조용한 성공', async () => {
    const { deps, sentEmails } = createTestDeps();
    const email = testEmail('reset-social-only');
    await testPrisma.user.create({
      data: { email, passwordHash: null, emailVerified: new Date() },
    });

    await expect(requestPasswordReset({ email }, TEST_CTX, deps)).resolves.toBeUndefined();
    expect(sentEmails).toHaveLength(0);
  });

  it('email·IP 기준 rate limit이 발동한다', async () => {
    const emailLimited = createTestDeps({ limiterMax: { resetRequestByEmail: 1 } });
    const email = testEmail('reset-rl-email');
    await requestPasswordReset({ email }, TEST_CTX, emailLimited.deps);
    await expect(
      requestPasswordReset({ email }, TEST_CTX, emailLimited.deps),
    ).rejects.toMatchObject({ code: ERROR_CODES.RATE_LIMITED });

    const ipLimited = createTestDeps({ limiterMax: { resetRequestByIp: 1 } });
    const ctx = { ...TEST_CTX, ipAddress: '203.0.113.88' };
    await requestPasswordReset({ email: testEmail('reset-rl-ip-1') }, ctx, ipLimited.deps);
    await expect(
      requestPasswordReset({ email: testEmail('reset-rl-ip-2') }, ctx, ipLimited.deps),
    ).rejects.toMatchObject({ code: ERROR_CODES.RATE_LIMITED });
  });
});

describe('resetPassword', () => {
  it('정상 재설정: 새 hash 저장, 토큰 사용 처리, 잔여 미사용 토큰 삭제', async () => {
    const { email, password, testDeps } = await createRegisteredUser('reset-ok');
    await requestPasswordReset({ email }, TEST_CTX, testDeps.deps);
    const rawToken = extractTokenFromEmail(testDeps.sentEmails[testDeps.sentEmails.length - 1]);

    // 소비 시점에 함께 정리되어야 하는 잔여 미사용 토큰을 인위적으로 추가
    const user = await testPrisma.user.findUniqueOrThrow({ where: { email } });
    await testPrisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(`stale-${email}`),
        expiresAt: new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS),
      },
    });

    const newPassword = 'NewPass1234!';
    await expect(resetPassword({ rawToken, newPassword }, testDeps.deps)).resolves.toBe('success');

    // 새 비밀번호로만 로그인된다
    await expect(
      loginWithCredentials({ email, password: newPassword }, CTX, testDeps.deps),
    ).resolves.not.toBeNull();
    await expect(loginWithCredentials({ email, password }, CTX, testDeps.deps)).resolves.toBeNull();

    // 소비된 토큰은 usedAt 보존, 그 외 미사용 토큰은 삭제된다
    const tokens = await testPrisma.passwordResetToken.findMany({ where: { userId: user.id } });
    expect(tokens).toHaveLength(1);
    expect(tokens[0].tokenHash).toBe(hashToken(rawToken));
    expect(tokens[0].usedAt).not.toBeNull();
  });

  it('만료된 토큰은 expired, 비밀번호는 바뀌지 않는다', async () => {
    const past = new Date(Date.now() - PASSWORD_RESET_TOKEN_TTL_MS - 60_000);
    const { email, password } = await createRegisteredUser('reset-expired');
    const { deps: pastDeps, sentEmails } = createTestDeps({ now: () => past });
    await requestPasswordReset({ email }, TEST_CTX, pastDeps);
    const rawToken = extractTokenFromEmail(sentEmails[0]);

    const { deps } = createTestDeps();
    await expect(resetPassword({ rawToken, newPassword: 'NewPass1234!' }, deps)).resolves.toBe(
      'expired',
    );

    await expect(loginWithCredentials({ email, password }, CTX, deps)).resolves.not.toBeNull();
  });

  it('사용된 토큰 재사용은 invalid — 두 번째 재설정은 반영되지 않는다', async () => {
    const { email, testDeps } = await createRegisteredUser('reset-reuse');
    await requestPasswordReset({ email }, TEST_CTX, testDeps.deps);
    const rawToken = extractTokenFromEmail(testDeps.sentEmails[testDeps.sentEmails.length - 1]);

    await expect(
      resetPassword({ rawToken, newPassword: 'FirstNew1234!' }, testDeps.deps),
    ).resolves.toBe('success');
    await expect(
      resetPassword({ rawToken, newPassword: 'SecondNew1234!' }, testDeps.deps),
    ).resolves.toBe('invalid');

    await expect(
      loginWithCredentials({ email, password: 'FirstNew1234!' }, CTX, testDeps.deps),
    ).resolves.not.toBeNull();
    await expect(
      loginWithCredentials({ email, password: 'SecondNew1234!' }, CTX, testDeps.deps),
    ).resolves.toBeNull();
  });

  it('무효 토큰은 invalid', async () => {
    const { deps } = createTestDeps();
    await expect(
      resetPassword({ rawToken: 'garbage', newPassword: 'NewPass1234!' }, deps),
    ).resolves.toBe('invalid');
    await expect(resetPassword({ rawToken: '', newPassword: 'NewPass1234!' }, deps)).resolves.toBe(
      'invalid',
    );
  });

  it('동시 재설정: 같은 토큰 병렬 소비 시 정확히 하나만 success', async () => {
    const { email, testDeps } = await createRegisteredUser('reset-race');
    await requestPasswordReset({ email }, TEST_CTX, testDeps.deps);
    const rawToken = extractTokenFromEmail(testDeps.sentEmails[testDeps.sentEmails.length - 1]);

    const [r1, r2] = await Promise.all([
      resetPassword({ rawToken, newPassword: 'RaceOne1234!' }, testDeps.deps),
      resetPassword({ rawToken, newPassword: 'RaceTwo1234!' }, testDeps.deps),
    ]);

    expect([r1, r2].filter((r) => r === 'success')).toHaveLength(1);
    expect([r1, r2].filter((r) => r === 'invalid')).toHaveLength(1);

    // 승자의 비밀번호로만 로그인된다
    const winnerPassword = r1 === 'success' ? 'RaceOne1234!' : 'RaceTwo1234!';
    const loserPassword = r1 === 'success' ? 'RaceTwo1234!' : 'RaceOne1234!';
    await expect(
      loginWithCredentials({ email, password: winnerPassword }, CTX, testDeps.deps),
    ).resolves.not.toBeNull();
    await expect(
      loginWithCredentials({ email, password: loserPassword }, CTX, testDeps.deps),
    ).resolves.toBeNull();
  });
});
