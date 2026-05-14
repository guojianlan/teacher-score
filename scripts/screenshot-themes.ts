#!/usr/bin/env tsx
// 三 theme 截屏（在 dev server 上）
import { chromium } from '@playwright/test';
import path from 'node:path';
import { promises as fs } from 'node:fs';

const OUT = path.resolve(__dirname, '../tmp/theme-screens');

async function main() {
  await fs.mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  // 不登录，只看 design-system.html（最直观）
  await page.goto('file://' + path.resolve(__dirname, '../docs/claude/design-system.html'));
  await page.evaluate(() => (document as Document & { fonts?: { ready?: Promise<void> } }).fonts?.ready);
  await page.waitForTimeout(500);

  for (const theme of ['light', 'dark', 'sepia']) {
    await page.evaluate((t) => {
      if (t === 'light') document.documentElement.removeAttribute('data-theme');
      else document.documentElement.setAttribute('data-theme', t);
    }, theme);
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(OUT, `${theme}.png`) });
    console.log(`✓ ${theme}.png`);
  }
  await browser.close();
}

main().catch((err) => { console.error(err); process.exit(1); });
