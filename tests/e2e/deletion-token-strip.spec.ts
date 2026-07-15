import { test, expect } from '@playwright/test';

import { loginViaForm } from './helpers/auth';

// 정상 형식(43자 base64url) dummy token — 실제 이메일 링크가 쓰는 정상-형식 token 교환 분기를
// 검증한다(DB에 없는 값이라 어떤 탈퇴도 발생하지 않는다). malformed('FAKE') 분기는 기존
// unit/integration이 커버하므로 E2E에서 중복하지 않는다. token 원문은 상수이며 로깅하지 않는다.
const DUMMY_TOKEN = 'A'.repeat(43);

// Phase 1 계약 (보안): 탈퇴 확인 링크의 ?token 은 proxy가 303으로 query 없는 URL로 교환해
// URL에 절대 남기지 않는다. GET만으로는 DB token 소비·탈퇴가 일어나지 않는다.
test('deletion confirm strips token from the URL (unauthenticated)', async ({ page }) => {
  const target = `/settings/account/delete/confirm?token=${DUMMY_TOKEN}`;
  expect(target).toContain('token='); // 최초 요청에는 token query가 존재

  await page.goto(target);

  // proxy 303 → query 없는 confirm → 비로그인 가드가 /login?next=delete-confirm 으로.
  await expect(page).toHaveURL(/localhost:3100\/login\?next=delete-confirm$/);
  expect(page.url()).not.toContain('token'); // 최종 URL·redirect chain에 token 없음
});

// Phase 1 계약: 온라인 탈퇴는 TRAVELER 전용. EXPERT/ADMIN은 unsupported(role=status) 안내만
// 보고 요청 폼은 렌더되지 않는다.
test('EXPERT sees unsupported notice and no request form', async ({ page }) => {
  await loginViaForm(page, 'expert@test.com', 'Test1234!');
  await page.goto('/settings/account/delete');

  await expect(page.getByRole('status')).toBeVisible();
  await expect(
    page.getByRole('button', { name: /탈퇴 확인 메일 받기|Send confirmation email/ }),
  ).toHaveCount(0);
});
