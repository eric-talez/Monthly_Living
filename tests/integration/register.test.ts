import { afterAll, describe, expect, it } from 'vitest';

import { AppError, ERROR_CODES } from '@/lib/errors';
import { registerUser } from '@/modules/auth/service';
import { hashToken } from '@/modules/auth/tokens';
import { registerSchema } from '@/modules/auth/validation';

import { cleanupOwnData, disconnect, testEmail, testPrisma } from './helpers/db';
import { createTestDeps, extractTokenFromEmail } from './helpers/deps';
import { registerInput, TEST_CTX } from './helpers/users';

afterAll(async () => {
  await cleanupOwnData();
  await disconnect();
});

describe('registerUser', () => {
  it('정상 가입: TRAVELER 생성 + bcrypt hash + 동의 기록 + 인증 토큰 (같은 tx)', async () => {
    const { deps, sentEmails } = createTestDeps();
    const email = testEmail('register-ok');

    const result = await registerUser(registerInput(email), TEST_CTX, deps);
    expect(result.outcome).toBe('created');

    const user = await testPrisma.user.findUniqueOrThrow({
      where: { email },
      include: { consents: true, emailVerificationTokens: true },
    });

    expect(user.role).toBe('TRAVELER');
    expect(user.status).toBe('ACTIVE');
    expect(user.emailVerified).toBeNull();
    expect(user.preferredLanguage).toBe('ko');

    // 비밀번호는 평문이 아니라 cost 12 bcrypt hash로 저장된다
    expect(user.passwordHash).toMatch(/^\$2[aby]\$12\$/);
    expect(user.passwordHash).not.toContain('Test1234!');

    // 필수 약관·개인정보 + 선택 마케팅(false)이 함께 기록된다
    const consentByType = new Map(user.consents.map((c) => [c.type, c.granted]));
    expect(consentByType.get('TERMS')).toBe(true);
    expect(consentByType.get('PRIVACY')).toBe(true);
    expect(consentByType.get('MARKETING')).toBe(false);

    // 인증 메일 1건 — 본문의 토큰 원문은 DB에 없고 sha256 hash만 저장된다
    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0].to).toBe(email);
    const rawToken = extractTokenFromEmail(sentEmails[0]);
    expect(user.emailVerificationTokens).toHaveLength(1);
    const stored = user.emailVerificationTokens[0];
    expect(stored.tokenHash).toBe(hashToken(rawToken));
    expect(stored.tokenHash).not.toBe(rawToken);
    expect(stored.usedAt).toBeNull();
    expect(stored.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('마케팅 동의 선택 시 granted=true로 기록된다', async () => {
    const { deps } = createTestDeps();
    const email = testEmail('register-marketing');

    await registerUser({ ...registerInput(email), marketingAccepted: true }, TEST_CTX, deps);

    const marketing = await testPrisma.consentRecord.findFirst({
      where: { user: { email }, type: 'MARKETING' },
    });
    expect(marketing?.granted).toBe(true);
  });

  it('이메일 정규화: 대소문자·공백이 달라도 같은 계정으로 수렴하고 응답 형태는 동일하다', async () => {
    const { deps, sentEmails } = createTestDeps();
    const email = testEmail('register-dupe');

    // 스키마 정규화를 경유해 실제 액션 경로와 동일하게 처리
    const first = registerSchema.parse(registerInput(`  ${email.toUpperCase()}  `));
    const firstResult = await registerUser(first, TEST_CTX, deps);
    expect(firstResult.outcome).toBe('created');

    const second = registerSchema.parse(registerInput(email));
    const secondResult = await registerUser(second, TEST_CTX, deps);
    expect(secondResult.outcome).toBe('existing-account');

    // 계정은 정규화된 이메일로 1개만 생성된다
    const users = await testPrisma.user.findMany({
      where: { email: { equals: email, mode: 'insensitive' } },
    });
    expect(users).toHaveLength(1);
    expect(users[0].email).toBe(email);

    // 중복 가입은 계정 상태와 무관하게 어떤 메일도 발송하지 않는다 (열거 방지)
    expect(sentEmails).toHaveLength(1);
  });

  it('동시 가입 race: 정확히 1명 생성, 나머지는 existing-account (P2002 경로 포함)', async () => {
    const { deps, sentEmails } = createTestDeps();
    const email = testEmail('register-race');

    const [r1, r2] = await Promise.all([
      registerUser(registerInput(email), TEST_CTX, deps),
      registerUser(registerInput(email), TEST_CTX, deps),
    ]);

    expect([r1.outcome, r2.outcome].sort()).toEqual(['created', 'existing-account']);
    const count = await testPrisma.user.count({ where: { email } });
    expect(count).toBe(1);
    expect(sentEmails).toHaveLength(1);
  });

  it('IP 기준 rate limit이 발동한다', async () => {
    const { deps } = createTestDeps({ limiterMax: { registerByIp: 2 } });
    const ctx = { ...TEST_CTX, ipAddress: '203.0.113.99' };

    await registerUser(registerInput(testEmail('register-rl-1')), ctx, deps);
    await registerUser(registerInput(testEmail('register-rl-2')), ctx, deps);

    await expect(
      registerUser(registerInput(testEmail('register-rl-3')), ctx, deps),
    ).rejects.toMatchObject({ code: ERROR_CODES.RATE_LIMITED });
    await expect(
      registerUser(registerInput(testEmail('register-rl-3')), ctx, deps),
    ).rejects.toBeInstanceOf(AppError);

    // 차단된 가입은 계정을 만들지 않는다
    const blocked = await testPrisma.user.findUnique({
      where: { email: testEmail('register-rl-3') },
    });
    expect(blocked).toBeNull();
  });
});
