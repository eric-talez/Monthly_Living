'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';

import { ErrorSummary } from '@/components/auth/error-summary';
import { Link } from '@/i18n/navigation';

import { loginAction, type LoginActionState } from './actions';

const inputClassName =
  'border-border bg-background w-full border px-3 py-2 text-sm focus-visible:outline-2';

export function LoginForm() {
  const t = useTranslations('auth');
  const [state, formAction, pending] = useActionState<LoginActionState, FormData>(
    loginAction,
    null,
  );

  const errorMessage = state?.ok === false ? state.error.message : null;

  return (
    <form action={formAction} noValidate className="mt-8 space-y-5">
      <ErrorSummary
        title={t('common.errorSummaryTitle')}
        messages={errorMessage ? [errorMessage] : []}
      />

      <div className="space-y-1.5">
        <label htmlFor="login-email" className="block text-sm font-medium">
          {t('common.emailLabel')}
        </label>
        <input
          id="login-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          aria-invalid={errorMessage ? true : undefined}
          className={inputClassName}
        />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between">
          <label htmlFor="login-password" className="block text-sm font-medium">
            {t('common.passwordLabel')}
          </label>
          <Link
            href="/forgot-password"
            className="text-muted-foreground hover:text-foreground text-xs underline underline-offset-2"
          >
            {t('login.forgotPasswordLink')}
          </Link>
        </div>
        <input
          id="login-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={errorMessage ? true : undefined}
          className={inputClassName}
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="bg-navy hover:bg-navy-strong w-full px-6 py-3 text-sm font-medium text-white transition-colors disabled:opacity-60"
      >
        {pending ? t('common.submitting') : t('login.submit')}
      </button>

      <p className="text-muted-foreground text-sm">
        {t('login.registerPrompt')}{' '}
        <Link href="/register" className="text-foreground underline underline-offset-2">
          {t('login.registerLink')}
        </Link>
      </p>
    </form>
  );
}
