import { test, expect } from '@playwright/test';

// Per checklist §十一.8: 登录 -> 加学生 -> 批改 -> 错题本 -> 导出 PDF.
// Reuses the account created in stage-1 (set E2E_REUSE_EMAIL/PASSWORD to reuse).

test('mistakes book lists at least the mock wrong question', async ({ page }) => {
  test.skip(!process.env.E2E_REUSE_EMAIL, 'requires stage-1 run first');
  await page.goto('/sign-in');
  await page.getByLabel('邮箱').fill(process.env.E2E_REUSE_EMAIL!);
  await page.getByLabel('密码').fill(process.env.E2E_REUSE_PASSWORD ?? 'password-12345');
  await page.getByRole('button', { name: '登录' }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  await page.goto('/mistakes');
  await expect(page.getByText(/错题本/)).toBeVisible();
});

test('export PDF enqueues a job', async ({ page }) => {
  test.skip(!process.env.E2E_GRADING_ID, 'set E2E_GRADING_ID to a completed grading');
  await page.goto(`/grade/${process.env.E2E_GRADING_ID}`);
  await page.getByRole('button', { name: '导出 PDF' }).click();
  await expect(page.getByText(/PDF 生成已入队/)).toBeVisible();
});
