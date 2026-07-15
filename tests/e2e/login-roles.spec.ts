import { test, expect } from '@playwright/test';

import { loginViaForm } from './helpers/auth';

// Phase 1 계약: 로그인 성공 → /post-login dispatcher가 역할·온보딩 상태로 목적지 결정.
// seed traveler(완료 프로필)·expert·admin 모두 홈(/)으로 수렴한다. 헤더의 로그아웃 버튼으로
// 세션 확립을 확인한다. seed 비밀번호는 prisma/seed-data/users.ts의 Test1234!.
const SEED_PASSWORD = 'Test1234!';

for (const email of ['traveler@test.com', 'expert@test.com', 'admin@test.com']) {
  test(`${email} → home after login`, async ({ page }) => {
    await loginViaForm(page, email, SEED_PASSWORD);
    await expect(page).toHaveURL(/localhost:3100\/$/);
    await expect(page.getByRole('button', { name: /^(로그아웃|Log out)$/ })).toBeVisible();
  });
}
