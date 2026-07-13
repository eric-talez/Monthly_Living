import { afterAll, describe, expect, it } from 'vitest';

import { ERROR_CODES } from '@/lib/errors';
import { EMAIL_VERIFICATION_TOKEN_TTL_MS } from '@/modules/auth/constants';
import { registerUser, resendVerificationEmail, verifyEmail } from '@/modules/auth/service';

import { cleanupOwnData, disconnect, testEmail, testPrisma } from './helpers/db';
import { createTestDeps, extractTokenFromEmail } from './helpers/deps';
import { createRegisteredUser, registerInput, TEST_CTX } from './helpers/users';

afterAll(async () => {
  await cleanupOwnData();
  await disconnect();
});

describe('verifyEmail', () => {
  it('정상 인증: emailVerified와 usedAt이 함께 설정된다', async () => {
    const { deps, sentEmails } = createTestDeps();
    const email = testEmail('verify-ok');
    await registerUser(registerInput(email), TEST_CTX, deps);
    const rawToken = extractTokenFromEmail(sentEmails[0]);

    await expect(verifyEmail(rawToken, deps)).resolves.toBe('verified');

    const user = await testPrisma.user.findUniqueOrThrow({
      where: { email },
      include: { emailVerificationTokens: true },
    });
    expect(user.emailVerified).not.toBeNull();
    expect(user.emailVerificationTokens[0].usedAt).not.toBeNull();
  });

  it('만료된 토큰은 expired로 거부되고 상태를 바꾸지 않는다', async () => {
    // 발급 시점을 TTL보다 과거로 주입 → expiresAt이 이미 지난 토큰
    const past = new Date(Date.now() - EMAIL_VERIFICATION_TOKEN_TTL_MS - 60_000);
    const { deps, sentEmails } = createTestDeps({ now: () => past });
    const email = testEmail('verify-expired');
    await registerUser(registerInput(email), TEST_CTX, deps);
    const rawToken = extractTokenFromEmail(sentEmails[0]);

    const { deps: freshDeps } = createTestDeps();
    await expect(verifyEmail(rawToken, freshDeps)).resolves.toBe('expired');

    const user = await testPrisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.emailVerified).toBeNull();
  });

  it('사용된 토큰 재사용은 already-verified로 안전하게 거부된다', async () => {
    const { deps, sentEmails } = createTestDeps();
    const email = testEmail('verify-reuse');
    await registerUser(registerInput(email), TEST_CTX, deps);
    const rawToken = extractTokenFromEmail(sentEmails[0]);

    await expect(verifyEmail(rawToken, deps)).resolves.toBe('verified');
    const after = await testPrisma.user.findUniqueOrThrow({ where: { email } });

    await expect(verifyEmail(rawToken, deps)).resolves.toBe('already-verified');
    const unchanged = await testPrisma.user.findUniqueOrThrow({ where: { email } });
    expect(unchanged.emailVerified?.getTime()).toBe(after.emailVerified?.getTime());
  });

  it('무효 토큰은 invalid', async () => {
    const { deps } = createTestDeps();
    await expect(verifyEmail('garbage-token', deps)).resolves.toBe('invalid');
    await expect(verifyEmail('', deps)).resolves.toBe('invalid');
  });

  it('동시 인증: 같은 토큰을 병렬로 소비해도 정확히 한 번만 verified', async () => {
    const { deps, sentEmails } = createTestDeps();
    const email = testEmail('verify-race');
    await registerUser(registerInput(email), TEST_CTX, deps);
    const rawToken = extractTokenFromEmail(sentEmails[0]);

    const results = await Promise.all([
      verifyEmail(rawToken, deps),
      verifyEmail(rawToken, deps),
      verifyEmail(rawToken, deps),
    ]);

    expect(results.filter((r) => r === 'verified')).toHaveLength(1);
    // 나머지는 안전한 거부 (winner가 이미 인증을 끝냈으므로 already-verified 또는 invalid)
    for (const other of results.filter((r) => r !== 'verified')) {
      expect(['already-verified', 'invalid']).toContain(other);
    }

    const tokens = await testPrisma.emailVerificationToken.findMany({
      where: { user: { email } },
    });
    expect(tokens).toHaveLength(1);
    expect(tokens[0].usedAt).not.toBeNull();
  });
});

describe('resendVerificationEmail', () => {
  it('재발급은 기존 미사용 토큰을 삭제하고 새 토큰만 유효하다', async () => {
    const { deps, sentEmails } = createTestDeps();
    const email = testEmail('resend-replace');
    await registerUser(registerInput(email), TEST_CTX, deps);
    const oldToken = extractTokenFromEmail(sentEmails[0]);

    await resendVerificationEmail({ email }, TEST_CTX, deps);
    expect(sentEmails).toHaveLength(2);
    const newToken = extractTokenFromEmail(sentEmails[1]);
    expect(newToken).not.toBe(oldToken);

    // 미사용 활성 토큰은 항상 1개
    const active = await testPrisma.emailVerificationToken.count({
      where: { user: { email }, usedAt: null },
    });
    expect(active).toBe(1);

    await expect(verifyEmail(oldToken, deps)).resolves.toBe('invalid');
    await expect(verifyEmail(newToken, deps)).resolves.toBe('verified');
  });

  it('동시 재발급: 병렬 실행 후에도 활성 토큰은 정확히 1개다', async () => {
    const { deps } = createTestDeps();
    const email = testEmail('resend-race');
    await registerUser(registerInput(email), TEST_CTX, deps);

    await Promise.all([
      resendVerificationEmail({ email }, TEST_CTX, deps),
      resendVerificationEmail({ email }, TEST_CTX, deps),
      resendVerificationEmail({ email }, TEST_CTX, deps),
    ]);

    const active = await testPrisma.emailVerificationToken.count({
      where: { user: { email }, usedAt: null },
    });
    expect(active).toBe(1);
  });

  it('미가입·이미 인증된 이메일은 메일 발송 없이 조용한 성공', async () => {
    const verified = await createRegisteredUser('resend-verified');
    const { deps, sentEmails } = createTestDeps();

    await expect(
      resendVerificationEmail({ email: testEmail('resend-none') }, TEST_CTX, deps),
    ).resolves.toBeUndefined();
    await expect(
      resendVerificationEmail({ email: verified.email }, TEST_CTX, deps),
    ).resolves.toBeUndefined();

    expect(sentEmails).toHaveLength(0);
  });

  it('email 기준과 IP 기준 rate limit이 각각 발동한다', async () => {
    // email 기준
    const emailLimited = createTestDeps({ limiterMax: { resendVerificationByEmail: 1 } });
    const email = testEmail('resend-rl-email');
    await registerUser(registerInput(email), TEST_CTX, emailLimited.deps);
    await resendVerificationEmail({ email }, TEST_CTX, emailLimited.deps);
    await expect(
      resendVerificationEmail({ email }, TEST_CTX, emailLimited.deps),
    ).rejects.toMatchObject({ code: ERROR_CODES.RATE_LIMITED });

    // IP 기준 — 서로 다른 이메일이라도 같은 IP면 차단
    const ipLimited = createTestDeps({ limiterMax: { resendVerificationByIp: 1 } });
    const ctx = { ...TEST_CTX, ipAddress: '203.0.113.77' };
    await resendVerificationEmail({ email: testEmail('resend-rl-ip-1') }, ctx, ipLimited.deps);
    await expect(
      resendVerificationEmail({ email: testEmail('resend-rl-ip-2') }, ctx, ipLimited.deps),
    ).rejects.toMatchObject({ code: ERROR_CODES.RATE_LIMITED });
  });
});
