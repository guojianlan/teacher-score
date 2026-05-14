#!/usr/bin/env tsx
/**
 * 给 token.json 的每个 theme set 加 v3 调色板结构（colorPalette 用）。
 *
 * v3 期望每个 palette 有这些子键：
 *   contrast / fg / subtle / muted / emphasized / solid / focusRing
 *
 * 我们给以下 palette 加结构：
 *   brand · secondary · danger · success · warning · info · neutral
 *
 * 这些 palette 取代旧的 interactive.* / status.* 子树。
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';

const TOKEN_PATH = path.resolve(__dirname, '../docs/claude/token.json');

type Dtcg = { $type: string; $value: unknown; $description?: string };
const c = (v: string, d: string): Dtcg => ({ $type: 'color', $value: v, $description: d });

type PaletteKeys = 'contrast' | 'fg' | 'subtle' | 'muted' | 'emphasized' | 'solid' | 'focusRing';

// 每个 theme + palette 的具体映射
// key 是 theme 名字（light/dark/sepia），value 是 palette → 7-tuple
type ThemePalettes = Record<string, Record<string, Record<PaletteKeys, string>>>;

const themePalettes: ThemePalettes = {
  light: {
    brand: {
      contrast:   '{core.color.white}',
      fg:         '{core.color.blue.700}',
      subtle:     '{core.color.blue.50}',
      muted:      '{core.color.blue.100}',
      emphasized: '{core.color.blue.200}',
      solid:      '{core.color.blue.600}',
      focusRing:  '{core.color.blue.500}',
    },
    secondary: {
      contrast:   '{core.color.gray.900}',
      fg:         '{core.color.gray.700}',
      subtle:     '{core.color.gray.50}',
      muted:      '{core.color.gray.100}',
      emphasized: '{core.color.gray.200}',
      solid:      '{core.color.white}',
      focusRing:  '{core.color.gray.400}',
    },
    neutral: {
      contrast:   '{core.color.white}',
      fg:         '{core.color.gray.700}',
      subtle:     '{core.color.gray.50}',
      muted:      '{core.color.gray.100}',
      emphasized: '{core.color.gray.200}',
      solid:      '{core.color.gray.700}',
      focusRing:  '{core.color.gray.400}',
    },
    danger: {
      contrast:   '{core.color.white}',
      fg:         '{core.color.red.700}',
      subtle:     '{core.color.red.50}',
      muted:      '{core.color.red.100}',
      emphasized: '{core.color.red.200}',
      solid:      '{core.color.red.600}',
      focusRing:  '{core.color.red.500}',
    },
    success: {
      contrast:   '{core.color.white}',
      fg:         '{core.color.green.700}',
      subtle:     '{core.color.green.50}',
      muted:      '{core.color.green.100}',
      emphasized: '{core.color.green.200}',
      solid:      '{core.color.green.600}',
      focusRing:  '{core.color.green.500}',
    },
    warning: {
      contrast:   '{core.color.white}',
      fg:         '{core.color.orange.700}',
      subtle:     '{core.color.orange.50}',
      muted:      '{core.color.orange.100}',
      emphasized: '{core.color.orange.200}',
      solid:      '{core.color.orange.600}',
      focusRing:  '{core.color.orange.500}',
    },
    info: {
      contrast:   '{core.color.white}',
      fg:         '{core.color.blue.700}',
      subtle:     '{core.color.blue.50}',
      muted:      '{core.color.blue.100}',
      emphasized: '{core.color.blue.200}',
      solid:      '{core.color.blue.600}',
      focusRing:  '{core.color.blue.500}',
    },
  },
  dark: {
    brand: {
      contrast:   '{core.color.white}',
      fg:         '{core.color.blue.300}',
      subtle:     '{core.color.blue.950}',
      muted:      '{core.color.blue.900}',
      emphasized: '{core.color.blue.800}',
      solid:      '{core.color.blue.500}',
      focusRing:  '{core.color.blue.400}',
    },
    secondary: {
      contrast:   '{core.color.gray.50}',
      fg:         '{core.color.gray.300}',
      subtle:     '{core.color.gray.950}',
      muted:      '{core.color.gray.900}',
      emphasized: '{core.color.gray.800}',
      solid:      '{core.color.gray.800}',
      focusRing:  '{core.color.gray.600}',
    },
    neutral: {
      contrast:   '{core.color.gray.900}',
      fg:         '{core.color.gray.300}',
      subtle:     '{core.color.gray.900}',
      muted:      '{core.color.gray.800}',
      emphasized: '{core.color.gray.700}',
      solid:      '{core.color.gray.300}',
      focusRing:  '{core.color.gray.600}',
    },
    danger: {
      contrast:   '{core.color.white}',
      fg:         '{core.color.red.300}',
      subtle:     '{core.color.red.950}',
      muted:      '{core.color.red.900}',
      emphasized: '{core.color.red.800}',
      solid:      '{core.color.red.500}',
      focusRing:  '{core.color.red.400}',
    },
    success: {
      contrast:   '{core.color.white}',
      fg:         '{core.color.green.300}',
      subtle:     '{core.color.green.950}',
      muted:      '{core.color.green.900}',
      emphasized: '{core.color.green.800}',
      solid:      '{core.color.green.500}',
      focusRing:  '{core.color.green.400}',
    },
    warning: {
      contrast:   '{core.color.white}',
      fg:         '{core.color.orange.300}',
      subtle:     '{core.color.orange.950}',
      muted:      '{core.color.orange.900}',
      emphasized: '{core.color.orange.800}',
      solid:      '{core.color.orange.500}',
      focusRing:  '{core.color.orange.400}',
    },
    info: {
      contrast:   '{core.color.white}',
      fg:         '{core.color.blue.300}',
      subtle:     '{core.color.blue.950}',
      muted:      '{core.color.blue.900}',
      emphasized: '{core.color.blue.800}',
      solid:      '{core.color.blue.500}',
      focusRing:  '{core.color.blue.400}',
    },
  },
  sepia: {
    brand: {
      contrast:   '{core.color.brown.50}',
      fg:         '{core.color.brown.700}',
      subtle:     '{core.color.brown.50}',
      muted:      '{core.color.brown.100}',
      emphasized: '{core.color.brown.200}',
      solid:      '{core.color.brown.700}',
      focusRing:  '{core.color.brown.500}',
    },
    secondary: {
      contrast:   '{core.color.brown.900}',
      fg:         '{core.color.brown.700}',
      subtle:     '{core.color.brown.50}',
      muted:      '{core.color.brown.100}',
      emphasized: '{core.color.brown.200}',
      solid:      '{core.color.white}',
      focusRing:  '{core.color.brown.400}',
    },
    neutral: {
      contrast:   '{core.color.white}',
      fg:         '{core.color.brown.700}',
      subtle:     '{core.color.brown.50}',
      muted:      '{core.color.brown.100}',
      emphasized: '{core.color.brown.200}',
      solid:      '{core.color.brown.700}',
      focusRing:  '{core.color.brown.400}',
    },
    danger: {
      contrast:   '{core.color.white}',
      fg:         '{core.color.red.700}',
      subtle:     '{core.color.red.50}',
      muted:      '{core.color.red.100}',
      emphasized: '{core.color.red.200}',
      solid:      '{core.color.red.600}',
      focusRing:  '{core.color.red.500}',
    },
    success: {
      contrast:   '{core.color.white}',
      fg:         '{core.color.green.700}',
      subtle:     '{core.color.green.50}',
      muted:      '{core.color.green.100}',
      emphasized: '{core.color.green.200}',
      solid:      '{core.color.green.600}',
      focusRing:  '{core.color.green.500}',
    },
    warning: {
      contrast:   '{core.color.white}',
      fg:         '{core.color.orange.700}',
      subtle:     '{core.color.orange.50}',
      muted:      '{core.color.orange.100}',
      emphasized: '{core.color.orange.200}',
      solid:      '{core.color.orange.600}',
      focusRing:  '{core.color.orange.500}',
    },
    info: {
      contrast:   '{core.color.white}',
      fg:         '{core.color.blue.700}',
      subtle:     '{core.color.blue.50}',
      muted:      '{core.color.blue.100}',
      emphasized: '{core.color.blue.200}',
      solid:      '{core.color.blue.600}',
      focusRing:  '{core.color.blue.500}',
    },
  },
};

async function main() {
  const json = JSON.parse(await fs.readFile(TOKEN_PATH, 'utf8'));

  for (const [theme, palettes] of Object.entries(themePalettes)) {
    if (!json[theme]) continue;
    json[theme].palette = json[theme].palette ?? {};
    for (const [name, keys] of Object.entries(palettes)) {
      const palette: Record<string, Dtcg> = {};
      for (const [k, v] of Object.entries(keys)) {
        palette[k] = c(v, `${theme} · ${name}.${k}`);
      }
      json[theme].palette[name] = palette;
    }
    console.log(`✓ ${theme}: 加 7 palettes`);
  }

  await fs.writeFile(TOKEN_PATH, JSON.stringify(json, null, 2));
  console.log('\n✓ token.json 已更新');
  console.log('下一步：pnpm tokens:sync');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
