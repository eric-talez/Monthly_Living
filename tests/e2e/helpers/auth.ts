import { expect, type Page } from '@playwright/test';

/**
 * 실제 Credentials 로그인 폼 제출 (persisted storageState 없음 — 매 테스트 실 로그인).
 * 성공 시 loginAction이 `/post-login` dispatcher를 거쳐 최종 목적지로 이동하므로
 * `/login`을 벗어날 때까지 대기한다(중간 `/post-login` URL은 assert하지 않는다).
 */
export async function loginViaForm(
  page: Page,
  email: string,
  password: string,
  locale: 'ko' | 'en' = 'ko',
): Promise<void> {
  await page.goto(`${locale === 'en' ? '/en' : ''}/login`);
  await page.locator('#login-email').fill(email);
  await page.locator('#login-password').fill(password);
  // 헤더의 로그인 링크(<a>)가 아니라 폼 제출 버튼(<button>)을 클릭한다.
  await page.getByRole('button', { name: /^(로그인|Log in)$/ }).click();
  await expect(page).not.toHaveURL(/\/login(\?|$)/);
}
