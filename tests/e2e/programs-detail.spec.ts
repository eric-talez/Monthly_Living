import { expect, test } from '@playwright/test';

/**
 * Phase 2B 공개 프로그램 상세 — 비로그인 흐름 + 404 no-leak.
 *
 * seed(handalsalgi_e2e_test, idempotent): 공개 38 + DRAFT 2(신하늘/PENDING, jeju·diet-wellness).
 * per-run fixture를 만들지 않는 순수 공개 read라 teardown/cleanup 위험이 없다.
 * locale은 playwright.config의 ko-KR — `/programs`·`/programs/[slug]`가 ko canonical(무접두)로 제공된다.
 */
test.describe('public program detail (2B)', () => {
  test('목록 카드 → 상세 이동, 핵심 정보 표시, 목록 복귀', async ({ page }) => {
    await page.goto('/programs');
    await expect(page.locator('article').first()).toBeVisible();

    // 첫 카드의 제목 링크로 상세 진입(카드는 제목을 상세로 링크한다).
    const firstTitleLink = page.locator('article h3 a').first();
    const title = ((await firstTitleLink.textContent()) ?? '').trim();
    await firstTitleLink.click();

    await expect(page).toHaveURL(/localhost:3100\/programs\/[a-z0-9-]+$/);
    // 단일 h1 = 프로그램 제목(목록 카드 제목과 일치)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
    // 전문가 공개 요약 섹션과 이미지(media)가 표시된다.
    await expect(page.getByRole('heading', { level: 2, name: '전문가 소개' })).toBeVisible();
    await expect(page.locator('img').first()).toBeVisible();

    // 목록으로 돌아가기 링크 동작
    await page.getByRole('link', { name: '목록으로 돌아가기' }).click();
    await expect(page).toHaveURL(/localhost:3100\/programs(\?|$)/);
    await expect(page.getByRole('heading', { level: 1, name: '프로그램 둘러보기' })).toBeVisible();
  });

  test('DRAFT slug 직접 접근 → 404 (존재·비공개 사유 미노출)', async ({ page }) => {
    const response = await page.goto('/programs/shin-haneul-wellness-reset');

    expect(response?.status()).toBe(404);
    await expect(
      page.getByRole('heading', { level: 1, name: '페이지를 찾을 수 없습니다' }),
    ).toBeVisible();
    // DRAFT 제목·준비중 마커가 어디에도 노출되지 않는다.
    await expect(page.getByText('제주 웰니스 리셋')).toHaveCount(0);
    await expect(page.getByText('준비 중')).toHaveCount(0);
  });

  test('존재하지 않는 slug → DRAFT와 동일한 404 결과', async ({ page }) => {
    const response = await page.goto('/programs/no-such-program-xyz');

    // DRAFT(비공개)와 미존재가 동일한 HTTP status·동일한 not-found 화면으로 수렴한다.
    expect(response?.status()).toBe(404);
    await expect(
      page.getByRole('heading', { level: 1, name: '페이지를 찾을 수 없습니다' }),
    ).toBeVisible();
  });
});
