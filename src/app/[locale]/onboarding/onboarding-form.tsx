'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';

import { ErrorSummary } from '@/components/auth/error-summary';
import { fieldErrorsOf } from '@/components/auth/field-errors';
import { ONBOARDING_LIMITS } from '@/modules/onboarding/constants';
import type { OnboardingFormOptions, OnboardingDraft } from '@/modules/onboarding/service';

import { submitOnboardingAction, type OnboardingActionState } from './actions';

const inputClassName =
  'border-border bg-background w-full border px-3 py-2 text-sm focus-visible:outline-2';
const sectionClassName = 'border-border space-y-4 border p-5';
const legendClassName = 'font-serif text-lg font-semibold px-1';

function FieldError({ id, error }: { id: string; error?: string }) {
  if (!error) {
    return null;
  }
  return (
    <p id={id} className="text-terracotta-strong text-xs">
      {error}
    </p>
  );
}

/** locale에 맞는 국가/도시/카테고리 표시명 선택 */
function pickLabel(locale: string, ko: string, en: string): string {
  return locale === 'ko' ? ko : en;
}

export function OnboardingForm({
  options,
  draft,
  locale,
}: {
  options: OnboardingFormOptions;
  draft: OnboardingDraft | null;
  locale: string;
}) {
  const t = useTranslations('onboarding');
  const [state, formAction, pending] = useActionState<OnboardingActionState, FormData>(
    submitOnboardingAction,
    null,
  );
  const errors = fieldErrorsOf(state);

  const countryTimezones = options.countryTimezones as Record<string, readonly string[]>;
  const initialCountry =
    draft?.country && (options.countries as readonly string[]).includes(draft.country)
      ? draft.country
      : '';
  const timezonesFor = (country: string): readonly string[] => countryTimezones[country] ?? [];
  const initialTimezones = timezonesFor(initialCountry);
  const initialTimezone =
    draft?.timezone && initialTimezones.includes(draft.timezone)
      ? draft.timezone
      : (initialTimezones[0] ?? '');

  const [country, setCountry] = useState(initialCountry);
  const [timezone, setTimezone] = useState(initialTimezone);
  const timezones = timezonesFor(country);

  function onCountryChange(next: string) {
    setCountry(next);
    const tzs = timezonesFor(next);
    setTimezone(draft?.timezone && tzs.includes(draft.timezone) ? draft.timezone : (tzs[0] ?? ''));
  }

  // 관심 국가 목록은 active Destination에서 도출 (거주 국가와 분리)
  const destinationCountries = Array.from(
    new Map(
      options.destinations.map((d) => [
        d.countryCode,
        { code: d.countryCode, label: pickLabel(locale, d.countryNameKo, d.countryNameEn) },
      ]),
    ).values(),
  );

  const summaryMessages =
    state?.ok === false
      ? Object.keys(errors).length > 0
        ? Object.values(errors)
        : [state.error.message]
      : [];

  const has = (list: string[] | undefined, value: string) => (list ?? []).includes(value);

  return (
    <form action={formAction} noValidate className="mt-8 space-y-6">
      <ErrorSummary title={t('common.errorSummaryTitle')} messages={summaryMessages} />

      {/* ── 기본 정보 ── */}
      <fieldset className={sectionClassName}>
        <legend className={legendClassName}>{t('sections.basic')}</legend>
        <div className="space-y-1.5">
          <label htmlFor="onb-fullName" className="block text-sm font-medium">
            {t('fields.fullName')} *
          </label>
          <input
            id="onb-fullName"
            name="fullName"
            type="text"
            required
            maxLength={ONBOARDING_LIMITS.FULLNAME_MAX}
            defaultValue={draft?.fullName ?? ''}
            autoComplete="name"
            aria-invalid={errors.fullName ? true : undefined}
            aria-describedby={errors.fullName ? 'onb-fullName-error' : undefined}
            className={inputClassName}
          />
          <FieldError id="onb-fullName-error" error={errors.fullName} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="onb-nickname" className="block text-sm font-medium">
              {t('fields.nickname')}{' '}
              <span className="text-muted-foreground">({t('common.optional')})</span>
            </label>
            <input
              id="onb-nickname"
              name="nickname"
              type="text"
              maxLength={ONBOARDING_LIMITS.NICKNAME_MAX}
              defaultValue={draft?.nickname ?? ''}
              className={inputClassName}
            />
            <FieldError id="onb-nickname-error" error={errors.nickname} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="onb-phone" className="block text-sm font-medium">
              {t('fields.phone')}{' '}
              <span className="text-muted-foreground">({t('common.optional')})</span>
            </label>
            <input
              id="onb-phone"
              name="phone"
              type="tel"
              maxLength={ONBOARDING_LIMITS.PHONE_MAX}
              defaultValue={draft?.phone ?? ''}
              autoComplete="tel"
              className={inputClassName}
            />
            <FieldError id="onb-phone-error" error={errors.phone} />
          </div>
        </div>
      </fieldset>

      {/* ── 지역·환경 ── */}
      <fieldset className={sectionClassName}>
        <legend className={legendClassName}>{t('sections.region')}</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="onb-country" className="block text-sm font-medium">
              {t('fields.country')} *
            </label>
            <select
              id="onb-country"
              name="country"
              required
              value={country}
              onChange={(e) => onCountryChange(e.target.value)}
              aria-invalid={errors.country ? true : undefined}
              className={inputClassName}
            >
              <option value="" disabled>
                —
              </option>
              {options.countries.map((code) => (
                <option key={code} value={code}>
                  {t(`countries.${code}`)}
                </option>
              ))}
            </select>
            <FieldError id="onb-country-error" error={errors.country} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="onb-timezone" className="block text-sm font-medium">
              {t('fields.timezone')} *
            </label>
            <select
              id="onb-timezone"
              name="timezone"
              required
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              disabled={timezones.length === 0}
              aria-invalid={errors.timezone ? true : undefined}
              className={inputClassName}
            >
              <option value="" disabled>
                —
              </option>
              {timezones.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
            <FieldError id="onb-timezone-error" error={errors.timezone} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="onb-uiLanguage" className="block text-sm font-medium">
              {t('fields.uiLanguage')} *
            </label>
            <select
              id="onb-uiLanguage"
              name="preferredLanguage"
              required
              defaultValue={draft?.preferredLanguage ?? locale}
              className={inputClassName}
            >
              {options.locales.map((loc) => (
                <option key={loc} value={loc}>
                  {t(`uiLanguage.${loc}`)}
                </option>
              ))}
            </select>
            <FieldError id="onb-uiLanguage-error" error={errors.preferredLanguage} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="onb-currency" className="block text-sm font-medium">
              {t('fields.currency')} *
            </label>
            <select
              id="onb-currency"
              name="preferredCurrency"
              required
              defaultValue={draft?.preferredCurrency ?? 'KRW'}
              className={inputClassName}
            >
              {options.currencies.map((cur) => (
                <option key={cur} value={cur}>
                  {cur}
                </option>
              ))}
            </select>
            <FieldError id="onb-currency-error" error={errors.preferredCurrency} />
          </div>
        </div>
      </fieldset>

      {/* ── 여행 목적·관심 지역 ── */}
      <fieldset className={sectionClassName}>
        <legend className={legendClassName}>{t('sections.interests')}</legend>

        <div className="space-y-2">
          <span className="block text-sm font-medium">{t('fields.travelPurposes')} *</span>
          <div className="flex flex-wrap gap-3">
            {options.categories.map((cat) => (
              <label key={cat.slug} className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  name="travelPurposes"
                  value={cat.slug}
                  defaultChecked={has(draft?.travelPurposes, cat.slug)}
                />
                <span>{pickLabel(locale, cat.nameKo, cat.nameEn)}</span>
              </label>
            ))}
          </div>
          <FieldError id="onb-travelPurposes-error" error={errors.travelPurposes} />
        </div>

        <p className="text-muted-foreground text-xs">{t('hints.destination')}</p>

        <div className="space-y-2">
          <span className="block text-sm font-medium">{t('fields.preferredCountries')}</span>
          <div className="flex flex-wrap gap-3">
            {destinationCountries.map((c) => (
              <label key={c.code} className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  name="preferredCountries"
                  value={c.code}
                  defaultChecked={has(draft?.preferredCountries, c.code)}
                />
                <span>{c.label}</span>
              </label>
            ))}
          </div>
          <FieldError id="onb-preferredCountries-error" error={errors.preferredCountries} />
        </div>

        <div className="space-y-2">
          <span className="block text-sm font-medium">{t('fields.preferredCities')}</span>
          <div className="flex flex-wrap gap-3">
            {options.destinations.map((d) => (
              <label key={d.slug} className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  name="preferredCities"
                  value={d.slug}
                  defaultChecked={has(draft?.preferredCities, d.slug)}
                />
                <span>{pickLabel(locale, d.cityNameKo, d.cityNameEn)}</span>
              </label>
            ))}
          </div>
          <FieldError id="onb-preferredCities-error" error={errors.preferredCities} />
        </div>
      </fieldset>

      {/* ── 여행 스타일 ── */}
      <fieldset className={sectionClassName}>
        <legend className={legendClassName}>{t('sections.style')}</legend>
        <div className="space-y-2">
          <span className="block text-sm font-medium">{t('fields.travelStyles')} *</span>
          <div className="flex flex-wrap gap-3">
            {options.travelStyles.map((style) => (
              <label key={style} className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  name="travelStyles"
                  value={style}
                  defaultChecked={has(draft?.travelStyles, style)}
                />
                <span>{t(`styles.${style}`)}</span>
              </label>
            ))}
          </div>
          <FieldError id="onb-travelStyles-error" error={errors.travelStyles} />
        </div>
        <div className="space-y-2">
          <span className="block text-sm font-medium">
            {t('fields.spokenLanguages')}{' '}
            <span className="text-muted-foreground">({t('common.optional')})</span>
          </span>
          <div className="flex flex-wrap gap-3">
            {options.preferredLanguages.map((lang) => (
              <label key={lang} className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  name="preferredLanguages"
                  value={lang}
                  defaultChecked={has(draft?.preferredLanguages, lang)}
                />
                <span>{t(`spokenLanguages.${lang}`)}</span>
              </label>
            ))}
          </div>
          <FieldError id="onb-preferredLanguages-error" error={errors.preferredLanguages} />
        </div>
      </fieldset>

      {/* ── 추가 정보 (선택) ── */}
      <fieldset className={sectionClassName}>
        <legend className={legendClassName}>{t('sections.extra')}</legend>
        <p className="text-muted-foreground text-xs">{t('hints.budget')}</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <label htmlFor="onb-budgetMin" className="block text-sm font-medium">
              {t('fields.budgetMin')}
            </label>
            <input
              id="onb-budgetMin"
              name="budgetMin"
              type="number"
              min={0}
              max={ONBOARDING_LIMITS.BUDGET_MAX}
              defaultValue={draft?.budgetMin ?? ''}
              className={inputClassName}
            />
            <FieldError id="onb-budgetMin-error" error={errors.budgetMin} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="onb-budgetMax" className="block text-sm font-medium">
              {t('fields.budgetMax')}
            </label>
            <input
              id="onb-budgetMax"
              name="budgetMax"
              type="number"
              min={0}
              max={ONBOARDING_LIMITS.BUDGET_MAX}
              defaultValue={draft?.budgetMax ?? ''}
              className={inputClassName}
            />
            <FieldError id="onb-budgetMax-error" error={errors.budgetMax} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="onb-groupSize" className="block text-sm font-medium">
              {t('fields.groupSize')}
            </label>
            <input
              id="onb-groupSize"
              name="groupSize"
              type="number"
              min={ONBOARDING_LIMITS.GROUP_SIZE_MIN}
              max={ONBOARDING_LIMITS.GROUP_SIZE_MAX}
              defaultValue={draft?.groupSize ?? 1}
              className={inputClassName}
            />
            <FieldError id="onb-groupSize-error" error={errors.groupSize} />
          </div>
        </div>
        <div className="flex flex-wrap gap-6">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="hasChildren"
              defaultChecked={draft?.hasChildren ?? false}
            />
            <span>{t('fields.hasChildren')}</span>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="hasPet" defaultChecked={draft?.hasPet ?? false} />
            <span>{t('fields.hasPet')}</span>
          </label>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="onb-accessibility" className="block text-sm font-medium">
            {t('fields.accessibilityNeeds')}{' '}
            <span className="text-muted-foreground">({t('common.optional')})</span>
          </label>
          <textarea
            id="onb-accessibility"
            name="accessibilityNeeds"
            rows={3}
            maxLength={ONBOARDING_LIMITS.ACCESSIBILITY_MAX}
            defaultValue={draft?.accessibilityNeeds ?? ''}
            className={inputClassName}
          />
          <FieldError id="onb-accessibility-error" error={errors.accessibilityNeeds} />
        </div>
      </fieldset>

      <button
        type="submit"
        disabled={pending}
        className="bg-navy hover:bg-navy-strong w-full px-6 py-3 text-sm font-medium text-white transition-colors disabled:opacity-60"
      >
        {pending ? t('common.submitting') : t('submit')}
      </button>
    </form>
  );
}
