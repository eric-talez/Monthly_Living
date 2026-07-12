import { ZodError } from 'zod';

import { ERROR_CODES, type ErrorCode, httpStatusForCode, isAppError } from '@/lib/errors';

/**
 * 모든 API(route handler·server action)의 통일된 응답 형식.
 * 성공: { ok: true, data } / 실패: { ok: false, error: { code, message, details? } }
 */
export interface ApiSuccess<T> {
  ok: true;
  data: T;
}

export interface ApiErrorBody {
  code: ErrorCode;
  message: string;
  details?: unknown;
}

export interface ApiFailure {
  ok: false;
  error: ApiErrorBody;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export function apiOk<T>(data: T): ApiSuccess<T> {
  return { ok: true, data };
}

export function apiFail(code: ErrorCode, message: string, details?: unknown): ApiFailure {
  return {
    ok: false,
    error: details === undefined ? { code, message } : { code, message, details },
  };
}

/**
 * 임의의 오류를 통일된 실패 응답으로 변환한다.
 * 예상하지 못한 오류는 내부 정보를 노출하지 않는 INTERNAL_ERROR로 감춘다.
 */
export function apiFailFrom(error: unknown): ApiFailure {
  if (isAppError(error)) {
    return apiFail(error.code, error.message, error.details);
  }

  if (error instanceof ZodError) {
    return apiFail(
      ERROR_CODES.VALIDATION_ERROR,
      'Invalid input.',
      error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    );
  }

  return apiFail(ERROR_CODES.INTERNAL_ERROR, 'An unexpected error occurred.');
}

/** 실패 응답에 대응하는 HTTP status code를 돌려준다. */
export function httpStatusForFailure(failure: ApiFailure): number {
  return httpStatusForCode(failure.error.code);
}
