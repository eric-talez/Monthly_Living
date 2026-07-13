'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';

import { ErrorSummary } from '@/components/auth/error-summary';

import { requestDeletionAction, type RequestDeletionActionState } from './actions';

export function RequestDeletionForm() {
  const t = useTranslations('settings.accountDeletion.request');
  const tAuth = useTranslations('auth.common');
  const [state, formAction, pending] = useActionState<RequestDeletionActionState, FormData>(
    requestDeletionAction,
    null,
  );

  const errorMessage = state?.ok === false ? state.error.message : null;

  return (
    <form action={formAction} noValidate className="mt-4 space-y-4">
      <ErrorSummary
        title={tAuth('errorSummaryTitle')}
        messages={errorMessage ? [errorMessage] : []}
      />

      <button
        type="submit"
        disabled={pending}
        className="border-terracotta text-terracotta-strong hover:bg-terracotta/10 w-full border px-6 py-3 text-sm font-medium transition-colors focus-visible:outline-2 disabled:opacity-60"
      >
        {pending ? tAuth('submitting') : t('submit')}
      </button>
    </form>
  );
}
