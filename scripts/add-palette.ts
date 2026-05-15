#!/usr/bin/env tsx
/**
 * 给 token.json 加一个 colorPalette —— 一行搞定 8 子键 × 3 theme。
 *
 * 用法：
 *   pnpm tokens:palette <name> <baseFamily>
 *
 *   pnpm tokens:palette purple purple    # 用 core.color.purple 色阶（必须已存在）
 *   pnpm tokens:palette mint   green     # 把 green 色阶起别名当 mint palette
 *
 * 规则（每个 theme，8 keys）：
 *   solid     = <scale>.600/500/700 (light/dark/sepia)
 *   contrast  = 按对 solid 的 WCAG 对比度自动选 white / near-black（运行时算）
 *   fg        = <scale>.700/300/700
 *   subtle    = <scale>.50/950/50
 *   muted     = <scale>.100/900/100
 *   emphasized= <scale>.200/800/200
 *   border    = <scale>.300/700/300
 *   focusRing = <scale>.500/400/500
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { wcagContrast } from 'culori';

const TOKEN_PATH = path.resolve(__dirname, '../docs/claude/token.json');

// 数字 = core.color.<family>.<step>，['ref','...'] = 任意 core.* 路径，'__auto_contrast' = 算
type Rule = number | readonly string[] | '__auto_contrast';

const conventions = {
  light: {
    contrast:   '__auto_contrast' as const,
    fg:         700,
    subtle:     50,
    muted:      100,
    emphasized: 200,
    border:     300,
    solid:      600,
    focusRing:  500,
  },
  dark: {
    contrast:   '__auto_contrast' as const,
    fg:         300,
    subtle:     950,
    muted:      900,
    emphasized: 800,
    border:     700,
    solid:      500,
    focusRing:  400,
  },
  sepia: {
    contrast:   '__auto_contrast' as const,
    fg:         700,
    subtle:     50,
    muted:      100,
    emphasized: 200,
    border:     300,
    solid:      700,
    focusRing:  500,
  },
} as const;

const ref = (...parts: (string | number)[]) => `{${parts.join('.')}}`;

// 给定 solid 的 hex，挑 white / near-black 中对比度高的当 contrast 色
function pickContrast(solidHex: string): { value: string; ref: string } {
  const WHITE = '#FFFFFF';
  const NEAR_BLACK = '#1A1A1A'; // gray.900 附近，对比度比纯黑略友好
  const cw = wcagContrast(solidHex, WHITE);
  const cb = wcagContrast(solidHex, NEAR_BLACK);
  if (cw >= cb) return { value: WHITE, ref: '{core.color.white}' };
  return { value: NEAR_BLACK, ref: '{core.color.black}' };
}

async function main() {
  const [name, family] = process.argv.slice(2);
  if (!name || !family) {
    console.error('Usage: pnpm tokens:palette <palette-name> <color-family>');
    console.error('Example: pnpm tokens:palette purple purple');
    process.exit(1);
  }

  const json = JSON.parse(await fs.readFile(TOKEN_PATH, 'utf8'));

  // 验证 color family 存在
  if (!json.core?.color?.[family]) {
    console.error(`✗ core.color.${family} 不存在。先加色阶到 token.json 的 core.color 下。`);
    process.exit(1);
  }
  // 验证色阶有需要的档位
  const required = [50, 100, 200, 300, 700, 900, 950];
  for (const step of required) {
    if (!json.core.color[family][step]) {
      console.error(`✗ core.color.${family}.${step} 不存在。色阶要 11 档（50–950）。`);
      process.exit(1);
    }
  }

  for (const [theme, rules] of Object.entries(conventions) as Array<[keyof typeof conventions, typeof conventions.light]>) {
    if (!json[theme]) {
      console.log(`  ⤳ ${theme} theme 不存在，跳过`);
      continue;
    }
    json[theme].palette = json[theme].palette ?? {};
    const palette: Record<string, { $type: string; $value: string; $description: string }> = {};

    // 先算 solid 的真实 hex（contrast 要看它）
    const solidRule = rules.solid;
    const solidHex = json.core.color[family][solidRule as number]?.$value as string;
    const contrastChoice = solidHex ? pickContrast(solidHex) : { value: '#FFFFFF', ref: '{core.color.white}' };

    for (const [key, rule] of Object.entries(rules)) {
      let value: string;
      let descSuffix = '';
      if (rule === '__auto_contrast') {
        value = contrastChoice.ref;
        descSuffix = ` (auto vs solid: ${contrastChoice.value})`;
      } else if (Array.isArray(rule)) {
        value = ref(...rule);
      } else {
        value = ref('core', 'color', family, rule as number);
      }
      palette[key] = {
        $type: 'color',
        $value: value,
        $description: `${theme} · ${name}.${key}${descSuffix}`,
      };
    }
    json[theme].palette[name] = palette;
    console.log(`✓ ${theme}.palette.${name}: 8 keys (contrast=${contrastChoice.value})`);
  }

  // 确保 core.color.black 存在（auto_contrast 可能引用它）
  if (!json.core.color.black) {
    json.core.color.black = {
      $type: 'color',
      $value: '#1A1A1A',
      $description: 'near-black，用于浅色 solid 上的文字对比',
    };
    console.log(`✓ 顺手补 core.color.black = #1A1A1A`);
  }

  await fs.writeFile(TOKEN_PATH, JSON.stringify(json, null, 2));
  console.log(`\n✓ token.json 更新完成`);
  console.log(`下一步：pnpm tokens:sync`);
  console.log(`使用：<Button colorPalette="${name}">...</Button>`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
