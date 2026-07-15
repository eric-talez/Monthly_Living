import { test, expect } from '@playwright/test';

import { e2eEmail } from './helpers/db';

// Phase 1 계약: 잘못된 로그인은 계정 존재/비밀번호/미인증을 구분하지 않는 일반화 오류로 수렴하고,
// 오류 요약은 role="alert"로 자동 포커스된다. 기본 접근성(lang·단일 h1·landmark·언어 nav)도 확인.
// 미존재 이메일은 run-scoped(e2e-${runId}-…@e2e.test)라 teardown이 LoginAttempt까지 정리한다.
test('invalid login → generic error + basic accessibility', async ({ page }) => {
  await page.goto('/login');
  await page.locator('#login-email').fill(e2eEmail('invalid-login'));
  await page.locator('#login-password').fill('WrongPassword123!');
  await page.getByRole('button', { name: /^(로그인|Log in)$/ }).click();

  await expect(page).toHaveURL(/localhost:3100\/login$/); // 잔류(네비게이션 없음)

  // role="alert"는 ErrorSummary와 Next.js route-announcer(빈 div) 둘 다 매칭되므로
  // 오류 요약 제목 텍스트로 범위를 좁힌다.
  const alert = page.getByRole('alert').filter({ hasText: /입력 내용을 확인|check your input/i });
  await expect(alert).toBeVisible();
  await expect(alert).toBeFocused(); // ErrorSummary가 useEffect로 자동 포커스
  await expect(page.locator('#login-email')).toHaveAttribute('aria-invalid', 'true');

  // 기본 접근성
  await expect(page.locator('html')).toHaveAttribute('lang', 'ko');
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.getByRole('banner')).toBeVisible();
  await expect(page.getByRole('main')).toBeVisible();
  await expect(page.getByRole('contentinfo')).toBeVisible();
  await expect(page.getByRole('navigation', { name: /언어 선택|Select language/ })).toBeVisible();
});
