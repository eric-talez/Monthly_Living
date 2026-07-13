import { z } from 'zod';

import { EMAIL_MAX_LENGTH, PASSWORD_MAX_BYTES, PASSWORD_MIN_LENGTH } from './constants';

/**
 * 인증 입력 스키마 (순수 모듈 — DB·env import 금지).
 *
 * 오류 message는 사람이 읽는 문장이 아니라 i18n 키다 — UI가
 * `auth.validation.*` 네임스페이스(src/messages)에서 번역해 표시한다.
 */

const utf8ByteLength = (value: string) => new TextEncoder().encode(value).length;

/** trim + lowercase 정규화를 스키마에 내장 — 모든 소비자가 동일하게 정규화된 값을 받는다 */
export const emailSchema = z
  .string('emailInvalid')
  .trim()
  .toLowerCase()
  .max(EMAIL_MAX_LENGTH, 'emailInvalid')
  .pipe(z.email('emailInvalid'));

/**
 * 비밀번호 정책: 최소 8자, 영문·숫자 각 1자 이상, UTF-8 기준 72바이트 이하.
 * 바이트 제한은 bcrypt silent truncation 거부용 — 문자 수(.max)로 검사하면
 * 한글·이모지에서 잘린 비밀번호가 저장될 수 있다 (constants.PASSWORD_MAX_BYTES).
 */
export const passwordSchema = z
  .string('required')
  .min(PASSWORD_MIN_LENGTH, 'passwordTooShort')
  .refine((value) => utf8ByteLength(value) <= PASSWORD_MAX_BYTES, 'passwordTooLong')
  .refine((value) => /[A-Za-z]/.test(value) && /[0-9]/.test(value), 'passwordNeedsLetterAndDigit');

/**
 * 로그인 비밀번호는 복잡도 정책(최소 8자·영문/숫자)을 검사하지 않는다 —
 * 기존 계정 호환을 위해 존재하는 비밀번호와의 일치만 본다.
 * 단 bcrypt 72바이트 silent truncation 상한은 로그인에도 강제한다:
 * 상한이 없으면 "정상 72바이트 비밀번호 + 임의 접미사"가 잘린 채 일치해 버린다.
 */
export const loginPasswordSchema = z
  .string('required')
  .min(1, 'required')
  .refine((value) => utf8ByteLength(value) <= PASSWORD_MAX_BYTES, 'passwordTooLong');

export const loginSchema = z.object({
  email: emailSchema,
  password: loginPasswordSchema,
});

export const registerSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    passwordConfirm: z.string('required').min(1, 'required'),
    termsAccepted: z.literal(true, 'consentRequired'),
    privacyAccepted: z.literal(true, 'consentRequired'),
    marketingAccepted: z.boolean(),
  })
  .refine((value) => value.password === value.passwordConfirm, {
    message: 'passwordMismatch',
    path: ['passwordConfirm'],
  });

/** 인증 메일 재전송·비밀번호 재설정 요청 공용 */
export const emailOnlySchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z
  .object({
    token: z.string('required').min(1, 'required'),
    password: passwordSchema,
    passwordConfirm: z.string('required').min(1, 'required'),
  })
  .refine((value) => value.password === value.passwordConfirm, {
    message: 'passwordMismatch',
    path: ['passwordConfirm'],
  });

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type EmailOnlyInput = z.infer<typeof emailOnlySchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

/** UI가 auth.validation.*에서 번역할 수 있는 키 목록 — 스키마 message와 1:1 */
export const VALIDATION_MESSAGE_KEYS = [
  'required',
  'emailInvalid',
  'passwordTooShort',
  'passwordTooLong',
  'passwordNeedsLetterAndDigit',
  'passwordMismatch',
  'consentRequired',
] as const;

export type ValidationMessageKey = (typeof VALIDATION_MESSAGE_KEYS)[number];

/** 알 수 없는 message(라이브러리 기본 문구 등)는 required로 안전하게 수렴시킨다 */
export function toValidationKey(message: string): ValidationMessageKey {
  return (VALIDATION_MESSAGE_KEYS as readonly string[]).includes(message)
    ? (message as ValidationMessageKey)
    : 'required';
}
