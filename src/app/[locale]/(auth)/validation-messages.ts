import 'server-only';

import type { ZodError } from 'zod';

import { toValidationKey } from '@/modules/auth/validation';

type AuthTranslator = (key: string) => string;

/**
 * Zod 검증 오류를 필드별 번역 메시지로 변환한다 — 서버 액션 전용.
 * 스키마의 message는 i18n 키(auth.validation.*)이며 여기서 번역해
 * 클라이언트에는 완성된 문자열만 내려간다.
 */
export function fieldErrorsFrom(error: ZodError, t: AuthTranslator): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = issue.path.join('.') || 'form';
    if (!(field in fieldErrors)) {
      fieldErrors[field] = t(`validation.${toValidationKey(issue.message)}`);
    }
  }
  return fieldErrors;
}
