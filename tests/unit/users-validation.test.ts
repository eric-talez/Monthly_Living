import { describe, expect, it } from 'vitest';

import { toValidationKey } from '@/modules/auth/validation';
import { DELETE_CONFIRMATION_TEXT, deleteAccountConfirmSchema } from '@/modules/users/validation';

describe('deleteAccountConfirmSchema', () => {
  it("정확히 'DELETE'만 통과한다", () => {
    const parsed = deleteAccountConfirmSchema.safeParse({ confirmText: 'DELETE' });
    expect(parsed.success).toBe(true);
    expect(DELETE_CONFIRMATION_TEXT).toBe('DELETE');
  });

  it.each([
    ['소문자', 'delete'],
    ['앞뒤 공백', ' DELETE '],
    ['접미사', 'DELETE!'],
    ['한글', '삭제'],
    ['빈 문자열', ''],
  ])('불일치 입력(%s)은 deleteConfirmMismatch 키로 실패한다', (_label, value) => {
    const parsed = deleteAccountConfirmSchema.safeParse({ confirmText: value });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.message).toBe('deleteConfirmMismatch');
    }
  });

  it('confirmText 누락(FormData null)도 deleteConfirmMismatch로 실패한다', () => {
    const parsed = deleteAccountConfirmSchema.safeParse({ confirmText: null });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.message).toBe('deleteConfirmMismatch');
    }
  });

  it('deleteConfirmMismatch는 등록된 번역 키다 — required로 수렴하지 않는다', () => {
    expect(toValidationKey('deleteConfirmMismatch')).toBe('deleteConfirmMismatch');
  });
});
