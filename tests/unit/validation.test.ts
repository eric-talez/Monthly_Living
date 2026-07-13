import { describe, expect, it } from 'vitest';

import { PASSWORD_MAX_BYTES } from '@/modules/auth/constants';
import { emailSchema, passwordSchema, registerSchema } from '@/modules/auth/validation';

const utf8Bytes = (value: string) => new TextEncoder().encode(value).length;

function firstIssueMessage(result: {
  success: boolean;
  error?: { issues: { message: string }[] };
}) {
  return result.success ? undefined : result.error?.issues[0]?.message;
}

describe('emailSchema', () => {
  it('trim + lowercase 정규화를 수행한다', () => {
    const result = emailSchema.safeParse('  User@Example.COM  ');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe('user@example.com');
    }
  });

  it('형식이 아닌 값은 emailInvalid 키로 거부한다', () => {
    const result = emailSchema.safeParse('not-an-email');
    expect(result.success).toBe(false);
    expect(firstIssueMessage(result)).toBe('emailInvalid');
  });
});

describe('passwordSchema', () => {
  it('seed 테스트 비밀번호(Test1234!)를 허용한다', () => {
    expect(passwordSchema.safeParse('Test1234!').success).toBe(true);
  });

  it('8자 미만은 passwordTooShort', () => {
    const result = passwordSchema.safeParse('a1b2c3');
    expect(firstIssueMessage(result)).toBe('passwordTooShort');
  });

  it('영문자 또는 숫자가 없으면 passwordNeedsLetterAndDigit', () => {
    expect(firstIssueMessage(passwordSchema.safeParse('onlyletters'))).toBe(
      'passwordNeedsLetterAndDigit',
    );
    expect(firstIssueMessage(passwordSchema.safeParse('12345678'))).toBe(
      'passwordNeedsLetterAndDigit',
    );
  });

  it('ASCII 72바이트 경계: 72바이트 통과, 73바이트 거부', () => {
    const exactly72 = 'a'.repeat(70) + '12';
    expect(utf8Bytes(exactly72)).toBe(PASSWORD_MAX_BYTES);
    expect(passwordSchema.safeParse(exactly72).success).toBe(true);

    const bytes73 = 'a'.repeat(71) + '12';
    expect(utf8Bytes(bytes73)).toBe(PASSWORD_MAX_BYTES + 1);
    expect(firstIssueMessage(passwordSchema.safeParse(bytes73))).toBe('passwordTooLong');
  });

  it('한글(3바이트) 비밀번호는 문자 수가 아니라 바이트 수로 제한된다', () => {
    // 'a1' (2B) + 한글 23자 (69B) = 71바이트 — 25자이지만 통과
    const korean71 = 'a1' + '가'.repeat(23);
    expect(utf8Bytes(korean71)).toBe(71);
    expect(passwordSchema.safeParse(korean71).success).toBe(true);

    // 'a1' (2B) + 한글 24자 (72B) = 74바이트 — 26자로 .max(72) 문자 검사라면 통과했을 값
    const korean74 = 'a1' + '가'.repeat(24);
    expect(utf8Bytes(korean74)).toBe(74);
    expect(firstIssueMessage(passwordSchema.safeParse(korean74))).toBe('passwordTooLong');
  });

  it('이모지(4바이트) 비밀번호도 바이트 수로 제한된다', () => {
    const emoji70 = 'a1' + '😀'.repeat(17); // 2 + 68 = 70바이트
    expect(utf8Bytes(emoji70)).toBe(70);
    expect(passwordSchema.safeParse(emoji70).success).toBe(true);

    const emoji74 = 'a1' + '😀'.repeat(18); // 2 + 72 = 74바이트
    expect(utf8Bytes(emoji74)).toBe(74);
    expect(firstIssueMessage(passwordSchema.safeParse(emoji74))).toBe('passwordTooLong');
  });
});

describe('registerSchema', () => {
  const base = {
    email: 'user@example.com',
    password: 'Test1234!',
    passwordConfirm: 'Test1234!',
    termsAccepted: true as const,
    privacyAccepted: true as const,
    marketingAccepted: false,
  };

  it('정상 입력을 허용하고 이메일을 정규화한다', () => {
    const result = registerSchema.safeParse({ ...base, email: ' USER@Example.com ' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe('user@example.com');
    }
  });

  it('필수 동의 누락은 consentRequired', () => {
    const result = registerSchema.safeParse({ ...base, termsAccepted: false });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.message)).toContain('consentRequired');
    }
  });

  it('비밀번호 확인 불일치는 passwordMismatch (passwordConfirm 경로)', () => {
    const result = registerSchema.safeParse({ ...base, passwordConfirm: 'Other1234!' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.message === 'passwordMismatch');
      expect(issue?.path).toEqual(['passwordConfirm']);
    }
  });
});
