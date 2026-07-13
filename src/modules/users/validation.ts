import { z } from 'zod';

/**
 * 계정 탈퇴 입력 스키마 (순수 모듈 — DB·env import 금지).
 * 오류 message는 i18n 키다 — auth.validation.* 네임스페이스에서 번역한다.
 */

/** 의사 확인용 문구 — 인증 수단이 아니다. 인증은 세션 + 이메일 토큰이 담당한다. */
export const DELETE_CONFIRMATION_TEXT = 'DELETE';

/** token은 폼이 아니라 HttpOnly cookie로 전달되므로 스키마에 포함하지 않는다. */
export const deleteAccountConfirmSchema = z.object({
  confirmText: z.literal(DELETE_CONFIRMATION_TEXT, 'deleteConfirmMismatch'),
});

export type DeleteAccountConfirmInput = z.infer<typeof deleteAccountConfirmSchema>;
