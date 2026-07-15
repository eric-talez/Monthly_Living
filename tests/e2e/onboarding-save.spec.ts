import { test, expect } from './fixtures';
import { loginViaForm } from './helpers/auth';

// Phase 1 계약: 미완료 traveler는 로그인 후 /onboarding으로 유도되고, 필수 항목을 저장하면
// /post-login을 거쳐 홈으로 이동하며 User·TravelerProfile이 실제 저장된다.
// fixture가 run-scoped 고유 email의 미완료 traveler를 만들고 teardown에서 정확히 삭제하므로
// retry에도 매번 fresh 미완료 상태다.
test('incomplete traveler completes onboarding → home + persisted profile', async ({
  page,
  incompleteTraveler,
  db,
}) => {
  await loginViaForm(page, incompleteTraveler.email, incompleteTraveler.password);
  await expect(page).toHaveURL(/localhost:3100\/onboarding\/?$/);

  await page.locator('#onb-fullName').fill('E2E 사용자');
  await page.locator('#onb-country').selectOption({ value: 'KR' });
  // country 선택 시 timezone이 React onChange로 Asia/Seoul 자동 채움 — 제출 전 확인해
  // cross-field Zod(isSupportedTimezoneForCountry)를 충족하고 hydration 대기 barrier로도 쓴다.
  await expect(page.locator('#onb-timezone')).toHaveValue('Asia/Seoul');
  // 저장 필수: travelPurposes≥1, (preferredCountries|preferredCities)≥1, travelStyles≥1.
  // preferredLanguage/currency는 default(locale/KRW) 유지.
  await page.locator('input[name="travelPurposes"]').first().check();
  await page.locator('input[name="preferredCities"]').first().check();
  await page.locator('input[name="travelStyles"]').first().check();

  await page.getByRole('button', { name: /^(저장하고 시작하기|Save and continue)$/ }).click();
  await expect(page).toHaveURL(/localhost:3100\/$/);

  // 저장 트랜잭션은 redirect 응답 전에 commit되므로 이 조회는 인과적으로 commit 이후다.
  const user = await db.user.findUniqueOrThrow({
    where: { email: incompleteTraveler.email },
    include: { travelerProfile: true },
  });
  expect(user.fullName).toBe('E2E 사용자');
  expect(user.country).toBe('KR');
  expect(user.travelerProfile).not.toBeNull();
});
