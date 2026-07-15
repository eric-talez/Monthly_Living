import { expect, test } from '@playwright/test';

/**
 * Phase 2A 공개 프로그램 목록 — 비로그인 탐색만 검증한다(상세 이동은 2B).
 *
 * seed(handalsalgi_e2e_test, idempotent): 공개 38 + DRAFT 2(신하늘/PENDING, jeju·diet-wellness).
 * per-run fixture를 만들지 않는 순수 공개 read라 teardown/cleanup 위험이 없다.
 * locale은 playwright.config의 ko-KR — `/programs`가 ko canonical(무접두)로 제공된다.
 */
test.describe('public program listing (2A)', () => {
  test('비로그인으로 목록 접근 — 로그인 리다이렉트 없이 공개 카드 노출', async ({ page }) => {
    await page.goto('/programs');

    await expect(page).toHaveURL(/localhost:3100\/programs(\?|$)/); // login으로 튕기지 않음
    await expect(page.getByRole('heading', { level: 1, name: '프로그램 둘러보기' })).toBeVisible();
    await expect(page.getByText('프로그램 38개')).toBeVisible(); // 공개 38만(DRAFT 2 제외)
    await expect(page.locator('article').first()).toBeVisible();
  });

  test('필터 적용 — URL·컨트롤·결과가 일치한다', async ({ page }) => {
    await page.goto('/programs');

    await page.getByLabel('국가').selectOption('TH');

    await expect(page).toHaveURL(/[?&]country=TH(&|$)/);
    await expect(page.getByLabel('국가')).toHaveValue('TH');

    const cards = page.locator('article');
    await expect(cards.first()).toBeVisible();
    const count = await cards.count();
    for (let i = 0; i < count; i += 1) {
      await expect(cards.nth(i)).toContainText('태국');
    }
  });

  test('페이지네이션 — 다음 페이지로 이동하면 URL과 표시가 갱신된다', async ({ page }) => {
    await page.goto('/programs');

    const pagination = page.getByRole('navigation', { name: '페이지 이동' });
    await expect(pagination.getByText('1 / 4')).toBeVisible();

    await pagination.getByRole('link', { name: '다음' }).click();

    await expect(page).toHaveURL(/[?&]page=2(&|$)/);
    await expect(pagination.getByText('2 / 4')).toBeVisible();
    await expect(page.locator('article').first()).toBeVisible();
  });

  test('DRAFT 미노출 — DRAFT가 속한 필터(jeju·diet-wellness)에서도 나타나지 않는다', async ({
    page,
  }) => {
    // 이 필터는 신하늘(PENDING)의 DRAFT 2건이 있는 바로 그 지점이다.
    // visibility filter가 없다면 여기서 나타나야 하지만, 공개 계약상 절대 노출되지 않는다.
    await page.goto('/programs?destination=jeju&category=diet-wellness');

    // 승인된 전문가의 공개 diet-wellness 프로그램은 존재(필터가 실제로 동작함을 확인)
    await expect(page.locator('article').first()).toBeVisible();

    // DRAFT 마커·제목은 어디에도 없어야 한다
    await expect(page.getByText('준비 중')).toHaveCount(0);
    await expect(page.getByText('제주 웰니스 리셋')).toHaveCount(0);
    await expect(page.getByText('오름 디톡스 워킹')).toHaveCount(0);
  });
});
