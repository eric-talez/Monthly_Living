'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';

import { ErrorSummary } from '@/components/auth/error-summary';
import { fieldErrorsOf } from '@/components/auth/field-errors';
import { Link } from '@/i18n/navigation';

import { forgotPasswordAction, type ForgotPasswordActionState } from './actions';

export function ForgotPasswordForm() {
  const t = useTranslations('auth');
  const [state, formAction, pending] = useActionState<ForgotPasswordActionState, FormData>(
    forgotPasswordAction,
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
    <form action={formAction} noValidate className="mt-8 space-y-4">
      <ErrorSummary title={t('common.errorSummaryTitle')} messages={summaryMessages} />

      {state?.ok ? (
        <p role="status" className="border-sage bg-sage/10 border px-4 py-3 text-sm">
          {t('forgotPassword.done')}
        </p>
      ) : null}

      <div className="space-y-1.5">
        <label htmlFor="forgot-email" className="block text-sm font-medium">
          {t('common.emailLabel')}
        </label>
        <input
          id="forgot-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          aria-invalid={fieldErrors.email ? true : undefined}
          aria-describedby={fieldErrors.email ? 'forgot-email-error' : undefined}
          className="border-border bg-background w-full border px-3 py-2 text-sm focus-visible:outline-2"
        />
        {fieldErrors.email ? (
          <p id="forgot-email-error" className="text-terracotta-strong text-xs">
            {fieldErrors.email}
          </p>
        ) : null}
      </div>

      <button
        type="submit"
        disabled={pending}
        className="bg-navy hover:bg-navy-strong w-full px-6 py-3 text-sm font-medium text-white transition-colors disabled:opacity-60"
      >
        {pending ? t('common.submitting') : t('forgotPassword.submit')}
      </button>

      <p className="text-sm">
        <Link href="/login" className="text-muted-foreground underline underline-offset-2">
          {t('forgotPassword.backToLogin')}
        </Link>
      </p>
    </form>
  );
}
