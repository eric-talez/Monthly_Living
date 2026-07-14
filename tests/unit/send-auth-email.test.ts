import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AuthServiceDeps } from '@/modules/auth/deps';
import { generateRawToken } from '@/modules/auth/tokens';

/**
 * sendAuthEmail의 오류 로그 완전 비민감화 회귀 테스트.
 * service.ts는 module-load 시점에 lib/env(fail-closed)를 평가하므로 env 스텁 후
 * dynamic import한다. verification/passwordReset/accountDeletion 메일이 모두
 * 이 단일 경로(sendAuthEmail)로 발송되므로 세 흐름의 보장을 함께 고정한다.
 */
process.env.AUTH_SECRET ??= 'unit-test-secret-0123456789abcdef0123456789';
process.env.DATABASE_URL ??= 'postgresql://unit:unit@localhost:5432/unit_test_placeholder';
const { sendAuthEmail } = await import('@/modules/auth/service');
const { buildAccountDeletionEmail, buildPasswordResetEmail, buildVerificationEmail } =
  await import('@/modules/auth/emails');

afterEach(() => {
  vi.restoreAllMocks();
});

const rawToken = generateRawToken();
const recipient = 'secret-traveler@example.com';

/** provider가 수신자·URL·raw token을 전부 담은 오류를 던지는 최악의 경우 */
function throwingProviderDeps(message: import('@/adapters/email/types').EmailMessage) {
  const providerError = new Error(
    `SMTP rejected: to=${message.to} url=${message.text.match(/https?:\S+/)?.[0] ?? ''} token=${rawToken}`,
  );
  // sendAuthEmail은 deps.emailProvider만 사용한다 — 나머지 필드는 이 테스트에서 불필요
  const deps = {
    emailProvider: { send: () => Promise.reject(providerError) },
  } as unknown as AuthServiceDeps;
  return { deps, providerError };
}

const EMAIL_CASES = [
  ['accountDeletion', buildAccountDeletionEmail],
  ['verification', buildVerificationEmail],
  ['passwordReset', buildPasswordResetEmail],
] as const;

describe('sendAuthEmail — 오류 로그 비민감화', () => {
  it.each(EMAIL_CASES)(
    '%s: provider 오류가 나도 throw 없이 종료하고 고정 문구만 기록한다',
    async (_label, build) => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const message = build({ to: recipient, preferredLanguage: 'ko', rawToken });
      const { deps, providerError } = throwingProviderDeps(message);

      // 흐름은 throw 없이 종료한다
      await expect(sendAuthEmail(deps, message)).resolves.toBeUndefined();

      const output = [...errorSpy.mock.calls, ...logSpy.mock.calls, ...warnSpy.mock.calls]
        .flat()
        .map((value) =>
          value instanceof Error ? `${value.message}\n${value.stack}` : String(value),
        )
        .join('\n');

      // raw token·전체 이메일·token=·confirm/인증 URL·provider 오류 메시지 전부 비노출
      expect(output).not.toContain(rawToken);
      expect(output).not.toContain(recipient);
      expect(output).not.toContain('token=');
      expect(output).not.toContain('/settings/account/delete/confirm');
      expect(output).not.toContain('http');
      expect(output).not.toContain(providerError.message);
      expect(output).not.toContain('SMTP rejected');

      // 고정 비민감 문구만 존재
      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy).toHaveBeenCalledWith('[auth] 이메일 발송 실패');
    },
  );
});
