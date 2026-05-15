#!/usr/bin/env tsx
/**
 * token.json 结构校验器。
 *
 * 用法：
 *   pnpm tokens:validate
 *
 * 退出码：
 *   0 = 通过
 *   1 = 有违规（CI 集成 + 阻塞 tokens:sync）
 *
 * 校验项：
 *   1. 3 主题齐全：light / dark / sepia
 *   2. 每个主题下 palette 数 ≤ 8
 *   3. 每个 palette 恰好 8 键：solid/contrast/fg/subtle/muted/emphasized/border/focusRing
 *   4. palette 中没有额外的键
 *   5. 所有 {ref} 引用都能解析
 *   6. 每个主题下 bg.canvas 必须存在（audit 需要）
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';

const TOKEN_PATH = path.resolve(__dirname, '../docs/claude/token.json');

const REQUIRED_THEMES = ['light', 'dark', 'sepia'] as const;
const REQUIRED_PALETTE_KEYS = new Set([
  'solid', 'contrast', 'fg', 'subtle', 'muted', 'emphasized', 'border', 'focusRing',
]);
const MAX_PALETTES = 8;

type Json = Record<string, any>;

const ANSI = {
  reset: '\x1b[0m', red: '\x1b[31m', green: '\x1b[32m', dim: '\x1b[2m', bold: '\x1b[1m',
};

function resolveRef(json: Json, ref: unknown, visited = new Set<string>()): unknown {
  if (typeof ref !== 'string') return ref;
  if (!ref.startsWith('{') || !ref.endsWith('}')) return ref;
  const inner = ref.slice(1, -1);
  if (visited.has(inner)) throw new Error(`circular reference: ${inner}`);
  visited.add(inner);

  let node: any = json;
  for (const part of inner.split('.')) {
    node = node?.[part];
    if (node === undefined) throw new Error(`unresolved reference: ${ref}`);
  }
  const val = node?.$value ?? node;
  return typeof val === 'string' && val.startsWith('{') ? resolveRef(json, val, visited) : val;
}

function walkTokens(json: Json, prefix: string, visit: (path: string, value: unknown) => void) {
  const node: any = prefix.split('.').reduce((acc, k) => acc?.[k], json);
  if (!node || typeof node !== 'object') return;

  function recurse(obj: any, p: string) {
    if (obj && typeof obj === 'object') {
      if ('$value' in obj) {
        visit(p, obj.$value);
        return;
      }
      for (const [k, v] of Object.entries(obj)) {
        recurse(v, p ? `${p}.${k}` : k);
      }
    }
  }
  recurse(node, prefix);
}

async function main() {
  const errors: string[] = [];
  const json = JSON.parse(await fs.readFile(TOKEN_PATH, 'utf8'));

  // 1. 3 主题齐全
  for (const theme of REQUIRED_THEMES) {
    if (!json[theme]) errors.push(`missing required theme: ${theme}`);
  }

  // 2 + 3 + 4. palette 数和键
  for (const theme of REQUIRED_THEMES) {
    if (!json[theme]?.palette) {
      errors.push(`${theme}.palette: missing`);
      continue;
    }
    const palettes = Object.keys(json[theme].palette);
    if (palettes.length > MAX_PALETTES) {
      errors.push(`${theme}.palette: ${palettes.length} palettes (max ${MAX_PALETTES})`);
    }

    for (const name of palettes) {
      const p = json[theme].palette[name];
      const keys = new Set(Object.keys(p));

      // 缺键
      for (const required of REQUIRED_PALETTE_KEYS) {
        if (!keys.has(required)) {
          errors.push(`${theme}.palette.${name}: missing key "${required}"`);
        }
      }
      // 多键
      for (const k of keys) {
        if (!REQUIRED_PALETTE_KEYS.has(k)) {
          errors.push(`${theme}.palette.${name}: unexpected key "${k}"`);
        }
      }
    }
  }

  // 5. refs 解析
  for (const theme of REQUIRED_THEMES) {
    if (!json[theme]) continue;
    walkTokens(json, theme, (p, value) => {
      try {
        resolveRef(json, value);
      } catch (err) {
        errors.push(`${theme}.${p}: ${(err as Error).message}`);
      }
    });
  }

  // 6. bg.canvas 存在
  for (const theme of REQUIRED_THEMES) {
    if (!json[theme]?.bg?.canvas?.$value) {
      errors.push(`${theme}.bg.canvas: missing`);
    }
  }

  // 输出
  if (errors.length === 0) {
    console.log(`${ANSI.green}${ANSI.bold}✓ token.json 校验通过${ANSI.reset}`);
    console.log(`${ANSI.dim}  ${REQUIRED_THEMES.length} themes · max ${MAX_PALETTES} palettes · 8 keys each${ANSI.reset}`);
    process.exit(0);
  }

  console.error(`${ANSI.red}${ANSI.bold}✗ token.json 校验失败 (${errors.length} 个问题)${ANSI.reset}\n`);
  for (const e of errors) console.error(`  ${ANSI.red}•${ANSI.reset} ${e}`);
  console.error();
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
