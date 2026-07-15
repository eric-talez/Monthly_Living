import { test, expect } from '@playwright/test';

// Phase 1 계약: /settings/account/** 는 per-page getSession() 가드로 비로그인 시 로그인으로
// (locale-aware) redirect한다. query가 붙을 수 있어 pathname 중심으로 assert한다.
test.describe('unauthenticated protected route redirect', () => {
  test('/settings/account → /login (ko)', async ({ page }) => {
    await page.goto('/settings/account');
    await expect(page).toHaveURL(/localhost:3100\/login(\?|$)/);
  });

  test('/en/settings/account → /en/login (en)', async ({ page }) => {
    await page.goto('/en/settings/account');
    await expect(page).toHaveURL(/localhost:3100\/en\/login(\?|$)/);
  });
});
