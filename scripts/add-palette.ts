#!/usr/bin/env tsx
/**
 * 给 token.json 加一个 colorPalette —— 一行搞定 7 子键 × N theme。
 *
 * 用法：
 *   pnpm tokens:palette <name> <baseFamily>
 *
 *   pnpm tokens:palette purple purple    # 用 core.color.purple 色阶（必须已存在）
 *   pnpm tokens:palette mint   green     # 把 green 色阶起别名当 mint palette
 *
 * 规则（每个 theme）：
 *   solid     = <scale>.600/500 (light/dark)
 *   contrast  = white
 *   fg        = <scale>.700/300
 *   subtle    = <scale>.50 /950
 *   muted     = <scale>.100/900
 *   emphasized= <scale>.200/800
 *   focusRing = <scale>.500/400
 *
 * Sepia theme 走暖色 mapping (棕底 + brown.700 / 800 等)，目前用 dark 规则近似。
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';

const TOKEN_PATH = path.resolve(__dirname, '../docs/claude/token.json');

const conventions = {
  light: {
    contrast:   ['core', 'color', 'white'],
    fg:         700,
    subtle:     50,
    muted:      100,
    emphasized: 200,
    solid:      600,
    focusRing:  500,
  },
  dark: {
    contrast:   ['core', 'color', 'white'],
    fg:         300,
    subtle:     950,
    muted:      900,
    emphasized: 800,
    solid:      500,
    focusRing:  400,
  },
  sepia: {
    contrast:   ['core', 'color', 'white'],
    fg:         700,
    subtle:     50,
    muted:      100,
    emphasized: 200,
    solid:      700,    // sepia 主色稍深
    focusRing:  500,
  },
} as const;

const ref = (...parts: (string | number)[]) => `{${parts.join('.')}}`;

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
    for (const [key, rule] of Object.entries(rules)) {
      const value = Array.isArray(rule)
        ? ref(...rule)
        : ref('core', 'color', family, rule as number);
      palette[key] = {
        $type: 'color',
        $value: value,
        $description: `${theme} · ${name}.${key}`,
      };
    }
    json[theme].palette[name] = palette;
    console.log(`✓ ${theme}.palette.${name}: 7 keys → core.color.${family}.*`);
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
