'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';

import { ErrorSummary } from '@/components/auth/error-summary';
import { fieldErrorsOf } from '@/components/auth/field-errors';

import { resendVerificationAction, type ResendActionState } from './actions';

export function ResendForm() {
  const t = useTranslations('auth');
  const [state, formAction, pending] = useActionState<ResendActionState, FormData>(
    resendVerificationAction,
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
    <form action={formAction} noValidate className="mt-6 space-y-4">
      <ErrorSummary title={t('common.errorSummaryTitle')} messages={summaryMessages} />

      {state?.ok ? (
        <p role="status" className="border-sage bg-sage/10 border px-4 py-3 text-sm">
          {t('verifyEmail.sent.resendDone')}
        </p>
      ) : null}

      <div className="space-y-1.5">
        <label htmlFor="resend-email" className="block text-sm font-medium">
          {t('verifyEmail.sent.resendLabel')}
        </label>
        <input
          id="resend-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          aria-invalid={fieldErrors.email ? true : undefined}
          aria-describedby={fieldErrors.email ? 'resend-email-error' : undefined}
          className="border-border bg-background w-full border px-3 py-2 text-sm focus-visible:outline-2"
        />
        {fieldErrors.email ? (
          <p id="resend-email-error" className="text-terracotta-strong text-xs">
            {fieldErrors.email}
          </p>
        ) : null}
      </div>

      <button
        type="submit"
        disabled={pending}
        className="border-border hover:bg-muted w-full border px-6 py-3 text-sm font-medium transition-colors disabled:opacity-60"
      >
        {pending ? t('common.submitting') : t('verifyEmail.sent.resendSubmit')}
      </button>
    </form>
  );
}
