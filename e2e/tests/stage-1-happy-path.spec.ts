import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Per checklist §六.16 / §十一.7:
// 登录 -> 创建学生 -> 上传 -> 批改 -> 轮询完成 -> 改分
//
// Requires the full stack running (web on 3000, backend on 3001, worker, DB).
// Uses the AI mock path (no AI_API_KEY) so the test is deterministic.

const email = `e2e-${Date.now()}@example.com`;
const password = 'password-12345';
const testDir = path.dirname(fileURLToPath(import.meta.url));
let gradingUrl = '';

async function signIn(page: import('@playwright/test').Page) {
  await page.goto('/sign-in');
  await page.getByLabel('邮箱').fill(email);
  await page.getByLabel('密码').fill(password);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test.describe.serial('stage 1 happy path', () => {
  test('sign up', async ({ page }) => {
    await page.goto('/sign-up');
    await page.getByLabel('姓名').fill('E2E 老师');
    await page.getByLabel('邮箱').fill(email);
    await page.getByLabel('密码').fill(password);
    await page.getByRole('button', { name: '注册并进入工作区' }).click();
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('add a student', async ({ page }) => {
    await signIn(page);
    await page.goto('/students');
    await page.getByRole('button', { name: /新建学生/ }).click();
    await page.getByLabel('姓名').fill('张三');
    await page.getByLabel('年级').fill('初二');
    await page.locator('input[type="checkbox"][value="math"]').check({ force: true });
    await page.getByRole('button', { name: '保存' }).click();
    await expect(page.getByText('张三')).toBeVisible();
  });

  test('upload and grade', async ({ page }) => {
    await signIn(page);
    await page.goto('/grade');
    const studentSelect = page.getByLabel('学生');
    const studentId = await studentSelect.locator('option', { hasText: '张三' }).first().getAttribute('value');
    expect(studentId).toBeTruthy();
    await studentSelect.selectOption(studentId!);

    // Upload a tiny synthetic PNG via the file input.
    const fixture = path.resolve(testDir, 'fixtures', 'tiny.png');
    await page.locator('input[type="file"]').setInputFiles(fixture);

    await page.waitForResponse((r) => r.url().includes('/api/upload') && r.ok());

    await page.getByRole('button', { name: '开始批改' }).click();
    await page.waitForURL(/\/grade\/gr_/);
    gradingUrl = page.url();
    // Wait for completion (mock LLM is instant).
    await expect(page.getByText('批改结果')).toBeVisible({ timeout: 30_000 });
  });

  test('override a score', async ({ page }) => {
    await signIn(page);
    await page.goto(gradingUrl);
    const inputs = page.locator('input[type="number"]');
    const first = inputs.first();
    await first.fill('1');
    await first.blur();
    await expect(page.getByText(/已更新|总分/)).toBeVisible();
  });
});
