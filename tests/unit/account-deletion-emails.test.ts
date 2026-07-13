import { afterEach, describe, expect, it, vi } from 'vitest';

import { createConsoleEmailProvider } from '@/adapters/email/console';
import { generateRawToken } from '@/modules/auth/tokens';

/**
 * emails.ts는 module-load 시점에 lib/env(fail-closed)를 평가하므로,
 * 필수 env를 스텁한 뒤 dynamic import한다 (unit 프로젝트에는 setup 파일이 없다).
 */
process.env.AUTH_SECRET ??= 'unit-test-secret-0123456789abcdef0123456789';
process.env.DATABASE_URL ??= 'postgresql://unit:unit@localhost:5432/unit_test_placeholder';
const { buildAccountDeletionEmail } = await import('@/modules/auth/emails');

afterEach(() => {
  vi.restoreAllMocks();
});

const rawToken = generateRawToken();

describe('buildAccountDeletionEmail', () => {
  it('ko: 제목·본문·확인 링크·30분 유효·미요청 무시 안내를 포함한다', () => {
    const message = buildAccountDeletionEmail({
      to: 'traveler@example.com',
      preferredLanguage: 'ko',
      rawToken,
    });

    expect(message.to).toBe('traveler@example.com');
    expect(message.subject).toContain('계정 탈퇴');
    expect(message.text).toContain('30분');
    expect(message.text).toContain('무시');
    // 기본 로케일(ko)은 locale prefix 없는 confirm 경로
    expect(message.text).toContain(`/settings/account/delete/confirm?token=${rawToken}`);
    expect(message.text).not.toContain('/en/settings/');
    expect(message.text).not.toContain('{url}');
  });

  it('en: 영어 제목·본문과 /en prefix 링크를 사용한다', () => {
    const message = buildAccountDeletionEmail({
      to: 'traveler@example.com',
      preferredLanguage: 'en',
      rawToken,
    });

    expect(message.subject).toContain('account deletion');
    expect(message.text).toContain('30 minutes');
    expect(message.text).toContain(`/en/settings/account/delete/confirm?token=${rawToken}`);
  });

  it('지원하지 않는 preferredLanguage는 ko로 수렴한다', () => {
    const message = buildAccountDeletionEmail({
      to: 'traveler@example.com',
      preferredLanguage: 'ja',
      rawToken,
    });
    expect(message.text).toContain('계정 탈퇴');
  });
});

describe('console provider redacted 모드 — 탈퇴 메일 비노출', () => {
  it('token·URL·본문·전체 이메일을 콘솔에 출력하지 않는다', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const message = buildAccountDeletionEmail({
      to: 'traveler@example.com',
      preferredLanguage: 'ko',
      rawToken,
    });
    await createConsoleEmailProvider('redacted').send(message);

    const output = [...logSpy.mock.calls, ...warnSpy.mock.calls].flat().join('\n');
    expect(output).not.toContain(rawToken);
    expect(output).not.toContain('token=');
    expect(output).not.toContain('/settings/account/delete/confirm');
    expect(output).not.toContain('traveler@example.com');
    // 마스킹된 수신자만 남는다
    expect(output).toContain('t***@e***');
  });
});
