'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';

import { ErrorSummary } from '@/components/auth/error-summary';
import { fieldErrorsOf } from '@/components/auth/field-errors';
import { Link } from '@/i18n/navigation';

import { resetPasswordAction, type ResetPasswordActionState } from './actions';

const inputClassName =
  'border-border bg-background w-full border px-3 py-2 text-sm focus-visible:outline-2';

export function ResetPasswordForm({ token }: { token: string }) {
  const t = useTranslations('auth');
  const [state, formAction, pending] = useActionState<ResetPasswordActionState, FormData>(
    resetPasswordAction,
    null,
  );

  const fieldErrors = fieldErrorsOf(state);
  const summaryMessages =
    state?.ok === false
      ? Object.keys(fieldErrors).length > 0
        ? Object.values(fieldErrors)
        : [state.error.message]
      : [];
  const tokenRejected =
    state?.ok === false &&
    state.error.details !== null &&
    typeof state.error.details === 'object' &&
    'reason' in state.error.details;

  return (
    <form action={formAction} noValidate className="mt-8 space-y-5">
      <ErrorSummary title={t('common.errorSummaryTitle')} messages={summaryMessages} />

      {tokenRejected ? (
        <p className="text-sm">
          <Link href="/forgot-password" className="underline underline-offset-2">
            {t('resetPassword.requestAgainLink')}
          </Link>
        </p>
      ) : null}

      <input type="hidden" name="token" value={token} />

      <div className="space-y-1.5">
        <label htmlFor="reset-password" className="block text-sm font-medium">
          {t('resetPassword.newPasswordLabel')}
        </label>
        <input
          id="reset-password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          aria-invalid={fieldErrors.password ? true : undefined}
          aria-describedby={fieldErrors.password ? 'reset-password-error' : 'reset-password-hint'}
          className={inputClassName}
        />
        <p id="reset-password-hint" className="text-muted-foreground text-xs">
          {t('register.passwordHint')}
        </p>
        {fieldErrors.password ? (
          <p id="reset-password-error" className="text-terracotta-strong text-xs">
            {fieldErrors.password}
          </p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <label htmlFor="reset-password-confirm" className="block text-sm font-medium">
          {t('resetPassword.newPasswordConfirmLabel')}
        </label>
        <input
          id="reset-password-confirm"
          name="passwordConfirm"
          type="password"
          autoComplete="new-password"
          required
          aria-invalid={fieldErrors.passwordConfirm ? true : undefined}
          aria-describedby={
            fieldErrors.passwordConfirm ? 'reset-password-confirm-error' : undefined
          }
          className={inputClassName}
        />
        {fieldErrors.passwordConfirm ? (
          <p id="reset-password-confirm-error" className="text-terracotta-strong text-xs">
            {fieldErrors.passwordConfirm}
          </p>
        ) : null}
      </div>

      <button
        type="submit"
        disabled={pending}
        className="bg-navy hover:bg-navy-strong w-full px-6 py-3 text-sm font-medium text-white transition-colors disabled:opacity-60"
      >
        {pending ? t('common.submitting') : t('resetPassword.submit')}
      </button>
    </form>
  );
}
