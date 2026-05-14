#!/usr/bin/env tsx
// Loads design-system.html in headless Chromium, screenshots full page +
// inspects all text nodes for empty / overlapping / overflow issues.
import { chromium } from '@playwright/test';
import path from 'node:path';
import { promises as fs } from 'node:fs';

const HTML = path.resolve(__dirname, '../docs/claude/design-system.html');
const OUT_DIR = path.resolve(__dirname, '../tmp/design-system-screens');

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  await page.goto('file://' + HTML);
  // wait for fonts
  await page.evaluate(() => (document as Document & { fonts?: { ready?: Promise<void> } }).fonts?.ready);
  await page.waitForTimeout(800);

  // Full-page screenshot
  await page.screenshot({ path: path.join(OUT_DIR, 'full.png'), fullPage: true });

  // Sectional screenshots: scroll the section into view and capture the visible viewport
  const sections = ['#semantic', '#text-styles', '#components', '#scales', '#sizing'];
  for (const sel of sections) {
    const exists = await page.$(sel);
    if (!exists) continue;
    await page.evaluate((s) => {
      const a = document.querySelector(s) as HTMLElement | null;
      if (a) a.scrollIntoView({ block: 'start' });
    }, sel);
    await page.waitForTimeout(300);
    const name = sel.replace('#', '');
    await page.screenshot({ path: path.join(OUT_DIR, `${name}.png`) });
  }

  // Diagnostic scan — pass plain JS string so tsx helpers don't leak
  const issues = await page.evaluate(`(() => {
    const problems = [];
    document.querySelectorAll('h1,h2,h3,h4,h5,td,span.sw-name,.token-name').forEach((el) => {
      const t = (el.textContent || '').trim();
      if (!t) problems.push({ type: 'empty-text', selector: el.tagName.toLowerCase() });
    });
    function rgb(s) { const m = s.match(/(\\\d+)[, ]+(\\\d+)[, ]+(\\\d+)/); return m ? [Number(m[1]),Number(m[2]),Number(m[3])] : null; }
    function lum(c) {
      const [r,g,b] = c.map((v) => { const u = v/255; return u <= 0.03928 ? u/12.92 : Math.pow((u+0.055)/1.055, 2.4); });
      return 0.2126*r + 0.7152*g + 0.0722*b;
    }
    document.querySelectorAll('.sw').forEach((el) => {
      const s = getComputedStyle(el);
      const a = rgb(s.backgroundColor); const b = rgb(s.color);
      if (!a || !b) return;
      const la = lum(a)+0.05; const lb = lum(b)+0.05;
      const ratio = la > lb ? la/lb : lb/la;
      if (ratio < 3) {
        const name = (el.querySelector('.sw-name') || {}).innerText || '?';
        problems.push({ type: 'low-contrast', selector: '.sw[' + name + ']', detail: 'ratio=' + ratio.toFixed(2) });
      }
    });
    document.querySelectorAll('h1,h2,h3,h4,h5,p,td').forEach((el) => {
      if (el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0) {
        problems.push({ type: 'overflow-x', selector: el.tagName.toLowerCase(), detail: (el.textContent || '').slice(0, 50) });
      }
    });
    document.querySelectorAll('.ts-sample').forEach((el) => {
      const cs = getComputedStyle(el).fontFamily.toLowerCase();
      if (!/open sans|poppins|source serif|jetbrains|figtree/.test(cs)) {
        problems.push({ type: 'font-missing', selector: '.ts-sample', detail: cs });
      }
    });
    return problems;
  })()`) as Array<{ type: string; selector: string; detail?: string }>;

  await browser.close();

  const report = path.join(OUT_DIR, 'report.json');
  await fs.writeFile(report, JSON.stringify({ issues, screens: ['full.png', ...sections.map((s) => s.slice(1) + '.png')] }, null, 2));

  console.log('=== screenshots ===');
  for (const f of await fs.readdir(OUT_DIR)) console.log(`  ${path.join(OUT_DIR, f)}`);
  console.log('\n=== issues (' + issues.length + ') ===');
  for (const p of issues.slice(0, 40)) console.log(' -', p);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
