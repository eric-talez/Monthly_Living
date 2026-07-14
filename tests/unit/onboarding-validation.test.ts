import { describe, expect, it } from 'vitest';

import { ONBOARDING_LIMITS } from '@/modules/onboarding/constants';
import { onboardingSchema } from '@/modules/onboarding/validation';

/** 유효한 최소 입력(핵심 5종) — 각 테스트에서 부분 override. */
function validInput(overrides: Record<string, unknown> = {}) {
  return {
    fullName: '김여행',
    country: 'KR',
    timezone: 'Asia/Seoul',
    preferredLanguage: 'ko',
    preferredCurrency: 'KRW',
    travelPurposes: ['fitness'],
    preferredCountries: ['KR'],
    preferredCities: ['jeju'],
    travelStyles: ['nature'],
    ...overrides,
  };
}

function issueMap(result: ReturnType<typeof onboardingSchema.safeParse>): Record<string, string> {
  if (result.success) {
    return {};
  }
  const map: Record<string, string> = {};
  for (const issue of result.error.issues) {
    // 필드 매퍼와 동일하게 첫 세그먼트로 키를 잡는다 (배열 원소 오류도 필드에 귀속)
    const key = issue.path.length > 0 ? String(issue.path[0]) : 'form';
    map[key] ??= issue.message;
  }
  return map;
}

describe('onboardingSchema — 유효 입력', () => {
  it('핵심 5종을 갖춘 최소 입력을 통과시키고 배열을 정규화한다', () => {
    const result = onboardingSchema.safeParse(validInput());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.fullName).toBe('김여행');
      expect(result.data.hasChildren).toBe(false);
      expect(result.data.hasPet).toBe(false);
      expect(result.data.preferredLanguages).toEqual([]);
    }
  });

  it('fullName 앞뒤 공백을 trim한다', () => {
    const result = onboardingSchema.safeParse(validInput({ fullName: '  홍길동  ' }));
    expect(result.success && result.data.fullName).toBe('홍길동');
  });

  it('배열 값의 중복을 제거한다', () => {
    const result = onboardingSchema.safeParse(
      validInput({ travelPurposes: ['fitness', 'fitness', 'remote-work'] }),
    );
    expect(result.success && result.data.travelPurposes).toEqual(['fitness', 'remote-work']);
  });
});

describe('onboardingSchema — 필수 경계', () => {
  it('빈 fullName은 required', () => {
    expect(issueMap(onboardingSchema.safeParse(validInput({ fullName: '   ' }))).fullName).toBe(
      'required',
    );
  });

  it('fullName 상한 초과는 fullNameTooLong', () => {
    const long = 'a'.repeat(ONBOARDING_LIMITS.FULLNAME_MAX + 1);
    expect(issueMap(onboardingSchema.safeParse(validInput({ fullName: long }))).fullName).toBe(
      'fullNameTooLong',
    );
  });

  it('미지원 country는 countryInvalid', () => {
    expect(issueMap(onboardingSchema.safeParse(validInput({ country: 'JP' }))).country).toBe(
      'countryInvalid',
    );
  });

  it('country에 맞지 않는 timezone은 timezoneInvalid', () => {
    // country KR인데 timezone이 Asia/Bangkok(TH) → 교차 검증 실패
    expect(
      issueMap(onboardingSchema.safeParse(validInput({ timezone: 'Asia/Bangkok' }))).timezone,
    ).toBe('timezoneInvalid');
  });

  it('country에 허용된 timezone 조합은 통과한다 (US/America-Chicago)', () => {
    const result = onboardingSchema.safeParse(
      validInput({ country: 'US', timezone: 'America/Chicago', preferredCurrency: 'USD' }),
    );
    expect(result.success).toBe(true);
  });

  it('미지원 locale은 localeInvalid', () => {
    expect(
      issueMap(onboardingSchema.safeParse(validInput({ preferredLanguage: 'fr' })))
        .preferredLanguage,
    ).toBe('localeInvalid');
  });

  it('미지원 currency는 currencyInvalid', () => {
    expect(
      issueMap(onboardingSchema.safeParse(validInput({ preferredCurrency: 'EUR' })))
        .preferredCurrency,
    ).toBe('currencyInvalid');
  });

  it('travelPurposes 없음은 purposesRequired', () => {
    expect(
      issueMap(onboardingSchema.safeParse(validInput({ travelPurposes: [] }))).travelPurposes,
    ).toBe('purposesRequired');
  });

  it('travelPurposes 최대 개수 초과는 purposesTooMany', () => {
    const many = Array.from({ length: ONBOARDING_LIMITS.PURPOSES_MAX + 1 }, (_, i) => `p-${i}`);
    expect(
      issueMap(onboardingSchema.safeParse(validInput({ travelPurposes: many }))).travelPurposes,
    ).toBe('purposesTooMany');
  });

  it('country·city 둘 다 없으면 destinationRequired', () => {
    expect(
      issueMap(
        onboardingSchema.safeParse(validInput({ preferredCountries: [], preferredCities: [] })),
      ).preferredCities,
    ).toBe('destinationRequired');
  });

  it('travelStyles 없음은 stylesRequired', () => {
    expect(
      issueMap(onboardingSchema.safeParse(validInput({ travelStyles: [] }))).travelStyles,
    ).toBe('stylesRequired');
  });

  it('미지원 travelStyle은 styleInvalid', () => {
    expect(
      issueMap(onboardingSchema.safeParse(validInput({ travelStyles: ['not-a-style'] })))
        .travelStyles,
    ).toBe('styleInvalid');
  });
});

describe('onboardingSchema — 선택 필드 경계', () => {
  it('budgetMin > budgetMax는 budgetRange', () => {
    expect(
      issueMap(onboardingSchema.safeParse(validInput({ budgetMin: '5000', budgetMax: '1000' })))
        .budgetMax,
    ).toBe('budgetRange');
  });

  it('음수 budget은 budgetInvalid', () => {
    expect(issueMap(onboardingSchema.safeParse(validInput({ budgetMin: '-1' }))).budgetMin).toBe(
      'budgetInvalid',
    );
  });

  it('groupSize 범위 밖(0)은 groupSizeInvalid', () => {
    expect(issueMap(onboardingSchema.safeParse(validInput({ groupSize: '0' }))).groupSize).toBe(
      'groupSizeInvalid',
    );
  });

  it('budget/groupSize 빈 문자열은 무시되고 통과한다', () => {
    const result = onboardingSchema.safeParse(
      validInput({ budgetMin: '', budgetMax: '', groupSize: '' }),
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.budgetMin).toBeUndefined();
      expect(result.data.groupSize).toBeUndefined();
    }
  });

  it('accessibilityNeeds 상한 초과는 accessibilityTooLong', () => {
    const long = 'a'.repeat(ONBOARDING_LIMITS.ACCESSIBILITY_MAX + 1);
    expect(
      issueMap(onboardingSchema.safeParse(validInput({ accessibilityNeeds: long })))
        .accessibilityNeeds,
    ).toBe('accessibilityTooLong');
  });

  it('preferredLanguages 중복 제거·enum 검증', () => {
    const result = onboardingSchema.safeParse(
      validInput({ preferredLanguages: ['ko', 'ko', 'en'] }),
    );
    expect(result.success && result.data.preferredLanguages).toEqual(['ko', 'en']);
  });
});
