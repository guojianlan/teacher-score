#!/usr/bin/env tsx
/**
 * Token WCAG 对比度审计。
 *
 * 用法：
 *   pnpm tokens:audit              # 全量审计
 *   pnpm tokens:audit --palette=primary
 *   pnpm tokens:audit --theme=dark
 *   pnpm tokens:audit --strict     # AAA（默认 AA）
 *
 * 退出码：
 *   0 = 全部通过
 *   1 = 有 FAIL（CI 集成用）
 *
 * 检查矩阵（每个 palette × 每个主题）：
 *
 *   ERROR（硬性，CI 必挂）：
 *     solid + contrast        ≥ 4.5:1  按钮文字
 *     subtle + fg             ≥ 4.5:1  浅底文字
 *     muted + fg              ≥ 4.5:1  hover 底文字
 *     emphasized + fg         ≥ 4.5:1  active 底文字
 *     focusRing vs bg.canvas  ≥ 3.0:1  focus 指示器（WCAG 2.2 强制）
 *     focusRing vs solid      ≥ 3.0:1  按钮上的 focus 环必须可见
 *
 *   WARN（软性，依赖使用场景）：
 *     border vs bg.canvas     ≥ 3.0:1  卡片描边不要求那么硬
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { wcagContrast } from 'culori';

const TOKEN_PATH = path.resolve(__dirname, '../docs/claude/token.json');

const THRESHOLDS = {
  AA:  { text: 4.5, ui: 3.0 },
  AAA: { text: 7.0, ui: 4.5 },
};

type Json = Record<string, any>;

// 解析 {core.color.blue.500} → 实际 hex
function resolveRef(json: Json, ref: string, visited = new Set<string>()): string {
  if (typeof ref !== 'string') return String(ref);
  if (!ref.startsWith('{')) return ref;
  const inner = ref.slice(1, -1);
  if (visited.has(inner)) throw new Error(`循环引用：${inner}`);
  visited.add(inner);

  let node: any = json;
  for (const part of inner.split('.')) {
    node = node?.[part];
    if (node === undefined) throw new Error(`无法解析引用：${ref}`);
  }
  const val = node?.$value ?? node;
  return typeof val === 'string' && val.startsWith('{') ? resolveRef(json, val, visited) : val;
}

type Severity = 'error' | 'warn';
type Check = { name: string; aColor: string; bColor: string; threshold: number; severity: Severity };

function buildChecks(
  json: Json,
  theme: 'light' | 'dark' | 'sepia',
  paletteName: string,
  bgCanvas: string,
  level: 'AA' | 'AAA',
): Check[] {
  const p = json[theme].palette[paletteName];
  const t = THRESHOLDS[level];

  const get = (key: string) => resolveRef(json, p[key]?.$value);

  return [
    // ERROR: 文本对比度硬约束
    { name: 'solid + contrast',        aColor: get('solid'),      bColor: get('contrast'),  threshold: t.text, severity: 'error' },
    { name: 'subtle + fg',             aColor: get('subtle'),     bColor: get('fg'),        threshold: t.text, severity: 'error' },
    { name: 'muted + fg',              aColor: get('muted'),      bColor: get('fg'),        threshold: t.text, severity: 'error' },
    { name: 'emphasized + fg',         aColor: get('emphasized'), bColor: get('fg'),        threshold: t.text, severity: 'error' },
    // ERROR: focus 指示器 a11y 强制
    { name: 'focusRing vs bg.canvas',  aColor: get('focusRing'),  bColor: bgCanvas,         threshold: t.ui,   severity: 'error' },
    { name: 'focusRing vs solid',      aColor: get('focusRing'),  bColor: get('solid'),     threshold: t.ui,   severity: 'error' },
    // WARN: 非文本 UI，场景相关
    { name: 'border vs bg.canvas',     aColor: get('border'),     bColor: bgCanvas,         threshold: t.ui,   severity: 'warn'  },
  ];
}

const ANSI = {
  reset: '\x1b[0m', red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', dim: '\x1b[2m', bold: '\x1b[1m',
};

async function main() {
  const argv = process.argv.slice(2);
  const flag = (k: string) => {
    const v = argv.find((a) => a.startsWith(`--${k}=`));
    return v ? v.split('=')[1] : null;
  };
  const has = (k: string) => argv.includes(`--${k}`);

  const onlyPalette = flag('palette');
  const onlyTheme = flag('theme') as 'light' | 'dark' | 'sepia' | null;
  const level: 'AA' | 'AAA' = has('strict') ? 'AAA' : 'AA';

  const json = JSON.parse(await fs.readFile(TOKEN_PATH, 'utf8'));

  let pass = 0;
  let errFail = 0;
  let warnFail = 0;
  const errors: string[] = [];
  const warnings: string[] = [];

  console.log(`${ANSI.bold}WCAG ${level} Token Audit${ANSI.reset}`);
  console.log(`Threshold: text ≥ ${THRESHOLDS[level].text}:1, ui ≥ ${THRESHOLDS[level].ui}:1\n`);

  for (const theme of ['light', 'dark', 'sepia'] as const) {
    if (onlyTheme && theme !== onlyTheme) continue;
    if (!json[theme]?.palette) continue;

    const bgCanvas = resolveRef(json, json[theme].bg?.canvas?.$value);
    if (!bgCanvas) {
      console.warn(`⚠ ${theme}: 找不到 bg.canvas，跳过该主题`);
      continue;
    }

    console.log(`${ANSI.bold}━━ ${theme}  (bg.canvas=${bgCanvas}) ━━${ANSI.reset}`);

    for (const paletteName of Object.keys(json[theme].palette)) {
      if (onlyPalette && paletteName !== onlyPalette) continue;
      const checks = buildChecks(json, theme, paletteName, bgCanvas, level);

      let paletteErrs = 0;
      let paletteWarns = 0;
      const lines: string[] = [];
      for (const c of checks) {
        const ratio = wcagContrast(c.aColor, c.bColor);
        const ok = ratio >= c.threshold;
        let tag: string;
        if (ok) {
          pass++;
          tag = `${ANSI.green}PASS${ANSI.reset}`;
        } else if (c.severity === 'error') {
          errFail++; paletteErrs++;
          errors.push(`${theme}.${paletteName}.${c.name}: ${ratio.toFixed(2)}:1 < ${c.threshold}:1`);
          tag = `${ANSI.red}FAIL${ANSI.reset}`;
        } else {
          warnFail++; paletteWarns++;
          warnings.push(`${theme}.${paletteName}.${c.name}: ${ratio.toFixed(2)}:1 < ${c.threshold}:1`);
          tag = `${ANSI.yellow}WARN${ANSI.reset}`;
        }
        const ratioStr = ratio.toFixed(2).padStart(5);
        lines.push(`    ${tag}  ${ratioStr}:1   ${c.name.padEnd(28)} ${ANSI.dim}${c.aColor} ↔ ${c.bColor}${ANSI.reset}`);
      }
      const headerColor = paletteErrs === 0 ? (paletteWarns === 0 ? ANSI.green : ANSI.yellow) : ANSI.red;
      const okCount = checks.length - paletteErrs - paletteWarns;
      console.log(`  ${headerColor}${paletteName}${ANSI.reset} ${ANSI.dim}(${okCount}/${checks.length})${ANSI.reset}`);
      lines.forEach((l) => console.log(l));
    }
    console.log();
  }

  const total = pass + errFail + warnFail;
  console.log(`${ANSI.bold}━━ 汇总 ━━${ANSI.reset}`);
  console.log(`  ${ANSI.green}PASS${ANSI.reset}: ${pass}`);
  if (warnFail) console.log(`  ${ANSI.yellow}WARN${ANSI.reset}: ${warnFail}  ${ANSI.dim}(场景相关，可接受)${ANSI.reset}`);
  if (errFail)  console.log(`  ${ANSI.red}FAIL${ANSI.reset}: ${errFail}  ${ANSI.dim}(必须修复)${ANSI.reset}`);
  console.log(`  Total: ${total}\n`);

  if (errors.length) {
    console.log(`${ANSI.red}${ANSI.bold}硬性失败明细：${ANSI.reset}`);
    errors.forEach((f) => console.log(`  - ${f}`));
    console.log();
  }
  if (warnings.length && has('verbose')) {
    console.log(`${ANSI.yellow}${ANSI.bold}警告明细：${ANSI.reset}`);
    warnings.forEach((f) => console.log(`  - ${f}`));
    console.log();
  } else if (warnings.length) {
    console.log(`${ANSI.dim}(${warnings.length} 条 WARN 已隐藏，加 --verbose 查看)${ANSI.reset}\n`);
  }

  if (errFail > 0) {
    console.log(`${ANSI.red}${ANSI.bold}✗ 审计未通过${ANSI.reset}`);
    process.exit(1);
  }
  console.log(`${ANSI.green}${ANSI.bold}✓ 审计通过${ANSI.reset}${warnFail ? ` ${ANSI.dim}(含 ${warnFail} 条 WARN)${ANSI.reset}` : ''}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
