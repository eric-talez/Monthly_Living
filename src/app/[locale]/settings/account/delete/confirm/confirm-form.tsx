'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';

import { ErrorSummary } from '@/components/auth/error-summary';
import { fieldErrorsOf } from '@/components/auth/field-errors';

import { confirmDeletionAction, type ConfirmDeletionActionState } from './actions';

/**
 * 탈퇴 최종 확인 폼. token은 폼에 싣지 않는다 — 서버가 HttpOnly cookie에서 읽는다.
 * DELETE 입력은 의사 확인용일 뿐 인증 수단이 아니다 (세션 + 이메일 토큰이 인증).
 */
export function ConfirmDeletionForm() {
  const t = useTranslations('settings.accountDeletion.confirm');
  const tAuth = useTranslations('auth.common');
  const [state, formAction, pending] = useActionState<ConfirmDeletionActionState, FormData>(
    confirmDeletionAction,
    null,
  );

  const fieldErrors = fieldErrorsOf(state);
  const summaryMessages =
    state?.ok === false
      ? Object.keys(fieldErrors).length > 0
        ? Object.values(fieldErrors)
        : [state.error.message]
      : [];
  const confirmTextError = fieldErrors.confirmText;
  const describedBy =
    ['delete-confirm-text-hint', confirmTextError ? 'delete-confirm-text-error' : null]
      .filter(Boolean)
      .join(' ') || undefined;

  return (
    <form action={formAction} noValidate className="mt-6 space-y-5">
      <ErrorSummary title={tAuth('errorSummaryTitle')} messages={summaryMessages} />

      <div className="space-y-1.5">
        <label htmlFor="delete-confirm-text" className="block text-sm font-medium">
          {t('confirmLabel')}
        </label>
        <input
          id="delete-confirm-text"
          name="confirmText"
          type="text"
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          required
          aria-invalid={confirmTextError ? true : undefined}
          aria-describedby={describedBy}
          className="border-border bg-background w-full border px-3 py-2 text-sm focus-visible:outline-2"
        />
        <p id="delete-confirm-text-hint" className="text-muted-foreground text-xs">
          {t('confirmHint')}
        </p>
        {confirmTextError ? (
          <p id="delete-confirm-text-error" className="text-terracotta-strong text-xs">
            {confirmTextError}
          </p>
        ) : null}
      </div>

      <button
        type="submit"
        disabled={pending}
        className="bg-terracotta hover:bg-terracotta-strong w-full px-6 py-3 text-sm font-medium text-white transition-colors focus-visible:outline-2 disabled:opacity-60"
      >
        {pending ? tAuth('submitting') : t('submit')}
      </button>
    </form>
  );
}
