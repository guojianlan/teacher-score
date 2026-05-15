#!/usr/bin/env tsx
/**
 * 给 token.json 加一个色族 —— 用输入 hex 作"色相来源"，OKLCH 算 11 档色阶 + 套 8 键 palette。
 *
 * 重要语义：
 *   输入 hex 用来确定色族的"色相 (hue)"，而非"保留到 500 档"。
 *   500 档（以及所有档位）的实际颜色由固定的 OKLCH L/C 曲线决定。
 *   也就是说：输入 #8B5CF6（紫）会生成一族紫，但 500 档不一定 = #8B5CF6。
 *
 * 用法：
 *   pnpm tokens:add-color <name> <hex>
 *
 *   pnpm tokens:add-color violet "#8B5CF6"   # 紫色族（hue 取自该 hex）
 *   pnpm tokens:add-color mint   "#10B981"   # 薄荷色族（hue 取自该 hex）
 *
 * 内部步骤：
 *   1. OKLCH 算法：取输入 hex 的 hue → 11 档色阶（50–950）→ core.color.<name>
 *   2. 输入 hex 存到 core.color.<name>.$description 作为元数据
 *   3. 调 add-palette 套 8 键 × 3 主题 → light/dark/sepia.palette.<name>
 *
 * 详见 docs/claude/DESIGN-TOKENS-SPEC.md §4。
 */
import { promises as fs } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { oklch, formatHex } from 'culori';

const TOKEN_PATH = path.resolve(__dirname, '../docs/claude/token.json');

// 11 档 step → OKLCH (L, C) 曲线
// L = 亮度 (0–1)；C = 饱和度（chroma），500 档最饱和，两端衰减
// hue 从 source hex 提取
const STEPS: Record<number, { l: number; c: number }> = {
  50:  { l: 0.97, c: 0.02 },
  100: { l: 0.94, c: 0.04 },
  200: { l: 0.88, c: 0.08 },
  300: { l: 0.80, c: 0.12 },
  400: { l: 0.70, c: 0.16 },
  500: { l: 0.60, c: 0.20 }, // anchor
  600: { l: 0.52, c: 0.20 },
  700: { l: 0.44, c: 0.18 },
  800: { l: 0.36, c: 0.14 },
  900: { l: 0.28, c: 0.10 },
  950: { l: 0.18, c: 0.06 },
};

const SCALE_HINTS: Record<string, string> = {
  '50':  'app 底色 / 卡片底',
  '100': 'UI 元素背景（hover bg）',
  '200': '弱边线 / active bg',
  '300': '边线 / border',
  '400': 'disabled fg / placeholder',
  '500': '低对比文本 / focusRing',
  '600': '主操作 solid (按钮底)',
  '700': '主操作 hover / fg',
  '800': '主操作 active',
  '900': '高对比文本',
  '950': '反色背景 / 最深',
};

function generateScale(hex: string): Record<string, string> {
  const src = oklch(hex);
  if (!src) throw new Error(`无法解析 hex: ${hex}`);

  // hue 可能为 undefined（纯灰色），fallback 0
  const h = src.h ?? 0;

  const out: Record<string, string> = {};
  for (const [step, { l, c }] of Object.entries(STEPS)) {
    const color = { mode: 'oklch' as const, l, c, h };
    const hex = formatHex(color);
    if (!hex) throw new Error(`无法生成 step ${step}`);
    out[step] = hex;
  }
  return out;
}

async function main() {
  const [name, hex] = process.argv.slice(2);
  if (!name || !hex) {
    console.error('Usage: pnpm tokens:add-color <name> <hex>');
    console.error('Example: pnpm tokens:add-color violet "#8B5CF6"');
    process.exit(1);
  }
  if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) {
    console.error(`✗ hex 必须是 #RRGGBB 格式（6 位），收到：${hex}`);
    process.exit(1);
  }

  const json = JSON.parse(await fs.readFile(TOKEN_PATH, 'utf8'));

  if (json.core?.color?.[name]) {
    console.error(`✗ core.color.${name} 已存在。如要重算，先手动删除该色族。`);
    process.exit(1);
  }

  // 1. 算 11 档
  const scale = generateScale(hex);

  json.core = json.core ?? {};
  json.core.color = json.core.color ?? {};
  json.core.color[name] = Object.fromEntries(
    Object.entries(scale).map(([step, val]) => {
      const stepNum = Number(step);
      const sourceNote = stepNum === 500 ? ` · hue source: ${hex}` : '';
      return [step, {
        $type: 'color',
        $value: val,
        $description: `${name}.${step} · ${SCALE_HINTS[step] ?? ''} (OKLCH${sourceNote})`,
      }];
    }),
  );

  await fs.writeFile(TOKEN_PATH, JSON.stringify(json, null, 2));
  console.log(`✓ core.color.${name}: 11 档色阶（hue 取自 ${hex}，OKLCH 生成）`);
  for (const [step, val] of Object.entries(scale)) {
    const marker = step === '500' && val.toLowerCase() !== hex.toLowerCase() ? '  ← 500 档 ≠ 输入色' : '';
    console.log(`    ${step.padStart(3)} → ${val}${marker}`);
  }
  console.log();

  // 2. 跑 add-palette
  console.log(`→ 套 8 键 palette × 3 主题...\n`);
  execSync(`pnpm tokens:palette ${name} ${name}`, { stdio: 'inherit' });

  // 3. WCAG 审计（只看新加的这个 palette）
  console.log(`\n→ WCAG 审计 ${name}...\n`);
  try {
    execSync(`pnpm tokens:audit --palette=${name}`, { stdio: 'inherit' });
  } catch {
    console.log(
      `\n⚠ ${name} 有 WCAG 失败项（不阻塞）。打开 docs/claude/design-lab.html 微调，或手改 token.json 后重跑：\n` +
      `  pnpm tokens:audit --palette=${name}\n`,
    );
  }

  console.log(`\n✓ 完成。下一步：pnpm tokens:sync`);
  console.log(`使用：<Button colorPalette="${name}">...</Button>`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
