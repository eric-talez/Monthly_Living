'use server';

import { hasLocale } from 'next-intl';
import { getLocale, getTranslations } from 'next-intl/server';

import { redirect } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { apiFail, type ApiFailure } from '@/lib/api-response';
import { ERROR_CODES } from '@/lib/errors';
import { getSession } from '@/lib/session';
import { POST_LOGIN_DESTINATIONS } from '@/modules/onboarding/redirect';
import { completeTravelerOnboarding } from '@/modules/onboarding/service';
import { onboardingSchema } from '@/modules/onboarding/validation';

import { onboardingFieldErrorsFrom } from './validation-messages';

export type OnboardingActionState = ApiFailure | null;

/**
 * 온보딩 저장 서버 액션 — 얇은 어댑터.
 * userId/role은 세션에서만 얻는다 (FormData의 role/userId는 신뢰하지 않는다).
 * 검증·slug 확인·트랜잭션 저장은 completeTravelerOnboarding(service)이 강제한다.
 */
export async function submitOnboardingAction(
  _prev: OnboardingActionState,
  formData: FormData,
): Promise<OnboardingActionState> {
  const t = await getTranslations('onboarding');
  const requestLocale = await getLocale();
  const locale = hasLocale(routing.locales, requestLocale) ? requestLocale : routing.defaultLocale;

  const session = await getSession();
  if (!session?.user) {
    redirect({ href: POST_LOGIN_DESTINATIONS.LOGIN, locale });
    return null;
  }

  const parsed = onboardingSchema.safeParse({
    fullName: formData.get('fullName'),
    country: formData.get('country'),
    timezone: formData.get('timezone'),
    preferredLanguage: formData.get('preferredLanguage'),
    preferredCurrency: formData.get('preferredCurrency'),
    travelPurposes: formData.getAll('travelPurposes'),
    preferredCountries: formData.getAll('preferredCountries'),
    preferredCities: formData.getAll('preferredCities'),
    travelStyles: formData.getAll('travelStyles'),
    preferredLanguages: formData.getAll('preferredLanguages'),
    nickname: formData.get('nickname'),
    phone: formData.get('phone'),
    budgetMin: formData.get('budgetMin'),
    budgetMax: formData.get('budgetMax'),
    groupSize: formData.get('groupSize'),
    hasChildren: formData.get('hasChildren') === 'on',
    hasPet: formData.get('hasPet') === 'on',
    accessibilityNeeds: formData.get('accessibilityNeeds'),
  });
  if (!parsed.success) {
    return apiFail(ERROR_CODES.VALIDATION_ERROR, t('common.errorSummaryTitle'), {
      fieldErrors: onboardingFieldErrorsFrom(parsed.error, t),
    });
  }

  let result;
  try {
    result = await completeTravelerOnboarding({ userId: session.user.id, input: parsed.data });
  } catch {
    // 입력 body·PII는 로그에 남기지 않는다 (고정 문구만)
    console.error('[onboarding] 온보딩 저장 실패');
    return apiFail(ERROR_CODES.INTERNAL_ERROR, t('common.unexpectedError'));
  }

  if (!result.ok) {
    if (result.reason === 'not-authorized') {
      // 비ACTIVE·비TRAVELER — dispatcher가 안전하게 재판정한다
      redirect({ href: '/post-login', locale });
      return null;
    }
    // reason === 'invalid' — service의 active slug 검증 실패를 필드 오류로 번역
    const fieldErrors: Record<string, string> = {};
    for (const [field, key] of Object.entries(result.fieldErrors)) {
      fieldErrors[field] = t(`validation.${key}`);
    }
    return apiFail(ERROR_CODES.VALIDATION_ERROR, t('common.errorSummaryTitle'), { fieldErrors });
  }

  // 저장 완료 — dispatcher를 통해 최종 목적지(홈)로
  redirect({ href: '/post-login', locale });
  return null;
}
