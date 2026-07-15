import { test, expect } from '@playwright/test';

import { loginViaForm } from './helpers/auth';

// Phase 1 계약: 이미 완료된 traveler가 /onboarding에 직접 접근하면 동일 resolver로 홈(/)으로
// 되돌려 보낸다(온보딩 폼 미노출). seed traveler@test.com은 완료 프로필이 있어 완료 상태다.
test('completed traveler is bounced away from /onboarding', async ({ page }) => {
  await loginViaForm(page, 'traveler@test.com', 'Test1234!');
  await expect(page).toHaveURL(/localhost:3100\/$/); // 완료 → 홈

  await page.goto('/onboarding');
  await expect(page).toHaveURL(/localhost:3100\/$/); // gate가 홈으로 bounce
  await expect(page.locator('#onb-fullName')).toHaveCount(0);
});
