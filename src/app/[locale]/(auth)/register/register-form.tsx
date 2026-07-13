'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';

import { ErrorSummary } from '@/components/auth/error-summary';
import { fieldErrorsOf } from '@/components/auth/field-errors';
import { Link } from '@/i18n/navigation';
import { EMAIL_MAX_LENGTH, PASSWORD_MAX_BYTES } from '@/modules/auth/constants';

import { registerAction, type RegisterActionState } from './actions';

const inputClassName =
  'border-border bg-background w-full border px-3 py-2 text-sm focus-visible:outline-2';

interface FieldProps {
  id: string;
  name: string;
  label: string;
  type: string;
  autoComplete: string;
  /** UTF-16 문자 수 기준 편의 상한 — 바이트 상한은 서버 스키마가 최종 강제 */
  maxLength?: number;
  error?: string;
  hint?: string;
}

function TextField({ id, name, label, type, autoComplete, maxLength, error, hint }: FieldProps) {
  const describedBy =
    [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(' ') ||
    undefined;

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        autoComplete={autoComplete}
        required
        maxLength={maxLength}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={inputClassName}
      />
      {hint ? (
        <p id={`${id}-hint`} className="text-muted-foreground text-xs">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="text-terracotta-strong text-xs">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function ConsentCheckbox({
  id,
  name,
  label,
  error,
}: {
  id: string;
  name: string;
  label: string;
  error?: string;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="flex items-start gap-2 text-sm">
        <input
          id={id}
          name={name}
          type="checkbox"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className="border-border mt-0.5"
        />
        <span>{label}</span>
      </label>
      {error ? (
        <p id={`${id}-error`} className="text-terracotta-strong text-xs">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function RegisterForm() {
  const t = useTranslations('auth');
  const [state, formAction, pending] = useActionState<RegisterActionState, FormData>(
    registerAction,
    null,
  );

  const fieldErrors = fieldErrorsOf(state);
  const summaryMessages =
    state?.ok === false
      ? Object.keys(fieldErrors).length > 0
        ? Object.values(fieldErrors)
        : [state.error.message]
      : [];

  return (
    <form action={formAction} noValidate className="mt-8 space-y-5">
      <ErrorSummary title={t('common.errorSummaryTitle')} messages={summaryMessages} />

      <TextField
        id="register-email"
        name="email"
        type="email"
        autoComplete="email"
        maxLength={EMAIL_MAX_LENGTH}
        label={t('common.emailLabel')}
        error={fieldErrors.email}
      />
      <TextField
        id="register-password"
        name="password"
        type="password"
        autoComplete="new-password"
        maxLength={PASSWORD_MAX_BYTES}
        label={t('common.passwordLabel')}
        hint={t('register.passwordHint')}
        error={fieldErrors.password}
      />
      <TextField
        id="register-password-confirm"
        name="passwordConfirm"
        type="password"
        autoComplete="new-password"
        maxLength={PASSWORD_MAX_BYTES}
        label={t('register.passwordConfirmLabel')}
        error={fieldErrors.passwordConfirm}
      />

      <fieldset className="border-border space-y-2 border p-4">
        <ConsentCheckbox
          id="register-terms"
          name="termsAccepted"
          label={t('register.termsLabel')}
          error={fieldErrors.termsAccepted}
        />
        <ConsentCheckbox
          id="register-privacy"
          name="privacyAccepted"
          label={t('register.privacyLabel')}
          error={fieldErrors.privacyAccepted}
        />
        <ConsentCheckbox
          id="register-marketing"
          name="marketingAccepted"
          label={t('register.marketingLabel')}
        />
      </fieldset>

      <button
        type="submit"
        disabled={pending}
        className="bg-navy hover:bg-navy-strong w-full px-6 py-3 text-sm font-medium text-white transition-colors disabled:opacity-60"
      >
        {pending ? t('common.submitting') : t('register.submit')}
      </button>

      <p className="text-muted-foreground text-sm">
        {t('register.loginPrompt')}{' '}
        <Link href="/login" className="text-foreground underline underline-offset-2">
          {t('register.loginLink')}
        </Link>
      </p>
    </form>
  );
}
