import type { AppLocale } from '@/i18n/routing';
import { registerUser, verifyEmail } from '@/modules/auth/service';

import { testEmail } from './db';
import { createTestDeps, extractTokenFromEmail, type TestDeps } from './deps';

export const TEST_IP = '203.0.113.10';
export const TEST_CTX: { ipAddress: string; locale: AppLocale } = {
  ipAddress: TEST_IP,
  locale: 'ko',
};

export const DEFAULT_TEST_PASSWORD = 'Test1234!';

export function registerInput(email: string, password = DEFAULT_TEST_PASSWORD) {
  return {
    email,
    password,
    passwordConfirm: password,
    termsAccepted: true as const,
    privacyAccepted: true as const,
    marketingAccepted: false,
  };
}

/** 가입(+선택적 이메일 인증)까지 마친 테스트 사용자 생성 — runId prefix 이메일만 사용 */
export async function createRegisteredUser(
  label: string,
  options: { verify?: boolean; password?: string; testDeps?: TestDeps } = {},
): Promise<{ email: string; password: string; testDeps: TestDeps }> {
  const { verify = true, password = DEFAULT_TEST_PASSWORD } = options;
  const testDeps = options.testDeps ?? createTestDeps();
  const email = testEmail(label);

  const result = await registerUser(registerInput(email, password), TEST_CTX, testDeps.deps);
  if (result.outcome !== 'created') {
    throw new Error(`테스트 사용자 생성 실패: ${result.outcome}`);
  }

  if (verify) {
    const token = extractTokenFromEmail(testDeps.sentEmails[testDeps.sentEmails.length - 1]);
    const verified = await verifyEmail(token, testDeps.deps);
    if (verified !== 'verified') {
      throw new Error(`테스트 사용자 인증 실패: ${verified}`);
    }
  }

  return { email, password, testDeps };
}
