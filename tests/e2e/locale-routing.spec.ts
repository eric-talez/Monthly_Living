import { test, expect } from '@playwright/test';

// Phase 1 계약: next-intl localePrefix 'as-needed' — ko는 prefix 없이 canonical, en은 /en,
// 기본 locale의 명시 prefix(/ko)는 canonical(/)로 정규화. 각 test는 fresh context라
// NEXT_LOCALE 쿠키 누수가 없다(use.locale=ko-KR → Accept-Language도 ko).
test.describe('locale / canonical routing', () => {
  test('/ serves ko with no redirect', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/localhost:3100\/$/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'ko');
  });

  test('/en serves en', async ({ page }) => {
    await page.goto('/en');
    await expect(page).toHaveURL(/localhost:3100\/en\/?$/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });

  test('/ko normalizes to / (default prefix stripped)', async ({ page }) => {
    await page.goto('/ko');
    await expect(page).toHaveURL(/localhost:3100\/$/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'ko');
  });
});
