import type { ApiResponse } from '@/lib/api-response';

/**
 * 서버 액션이 details.fieldErrors로 내려준 필드별 오류를 안전하게 꺼낸다.
 * (클라이언트 폼 공용 — server-only import 금지)
 */
export function fieldErrorsOf(
  state: ApiResponse<unknown> | null | undefined,
): Record<string, string> {
  if (
    state &&
    state.ok === false &&
    state.error.details !== null &&
    typeof state.error.details === 'object' &&
    'fieldErrors' in state.error.details
  ) {
    return (state.error.details as { fieldErrors: Record<string, string> }).fieldErrors;
  }
  return {};
}
