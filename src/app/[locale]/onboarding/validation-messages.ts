import 'server-only';

import type { ZodError } from 'zod';

import { toOnboardingValidationKey } from '@/modules/onboarding/validation';

type OnboardingTranslator = (key: string) => string;

/**
 * Zod 검증 오류를 필드별 번역 메시지로 변환한다 — 온보딩 서버 액션 전용.
 * 스키마 message는 i18n 키(`onboarding.validation.*`)이며 여기서 번역해
 * 클라이언트에는 완성된 문자열만 내려간다. (auth의 fieldErrorsFrom 미러)
 */
export function onboardingFieldErrorsFrom(
  error: ZodError,
  t: OnboardingTranslator,
): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    // 온보딩 필드는 전부 top-level이므로 첫 세그먼트를 필드 키로 쓴다 —
    // 배열 원소 오류(예: travelStyles.0)도 해당 필드(travelStyles)에 표시된다.
    const field = issue.path.length > 0 ? String(issue.path[0]) : 'form';
    if (!(field in fieldErrors)) {
      fieldErrors[field] = t(`validation.${toOnboardingValidationKey(issue.message)}`);
    }
  }
  return fieldErrors;
}
