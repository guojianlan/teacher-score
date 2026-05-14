#!/usr/bin/env tsx
/**
 * tokens/sync.ts
 *
 * 从 docs/claude/token.json （DTCG 格式）反向生成：
 *   - __generated.ts   类型 + 值（业务代码 import 这个）
 *   - tokens.css       CSS 变量（runtime）
 *   - design-system.html  视觉文档
 *
 * 跑：  pnpm tokens:sync
 *
 * 设计师改 Figma → Tokens Studio 推 token.json 到分支 → 我们 merge → 跑这个。
 * 开发者也可以直接改 JSON，跑这个，然后跑 dev。
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '../../../../..');
const JSON_IN = path.join(REPO, 'docs/claude/token.json');
const TS_OUT = path.join(REPO, 'apps/web/src/styles/tokens/__generated.ts');
const CSS_OUT = path.join(REPO, 'apps/web/src/styles/tokens.css');
const HTML_OUT = path.join(REPO, 'docs/claude/design-system.html');

type Doc = Record<string, unknown>;
interface Token { $type: string; $value: unknown; $description?: string }

const isToken = (n: unknown): n is Token =>
  !!n && typeof n === 'object' && '$value' in (n as object);

// ─── ref resolver ────────────────────────────────────────────────────
function resolveRefs(json: Doc): Doc {
  // 把所有 leaf 的 $value 中的 {a.b.c} 引用替换为目标 leaf 的 $value
  const get = (root: Doc, dotted: string): unknown => {
    const parts = dotted.split('.');
    let cur: unknown = root;
    for (const p of parts) {
      if (cur && typeof cur === 'object' && p in (cur as Doc)) cur = (cur as Doc)[p];
      else return undefined;
    }
    if (isToken(cur)) return cur.$value;
    return cur;
  };

  const resolve = (val: unknown, seen = new Set<string>()): unknown => {
    if (typeof val !== 'string') return val;
    return val.replace(/\{([^}]+)\}/g, (_m, ref: string) => {
      if (seen.has(ref)) return `{${ref}}`;
      seen.add(ref);
      const v = get(json, ref);
      if (v === undefined) return `{${ref}}`;
      const r = resolve(v, seen);
      return typeof r === 'string' ? r : JSON.stringify(r);
    });
  };

  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (node && typeof node === 'object') {
      if (isToken(node)) {
        return { ...node, $value: deepResolve(node.$value, json) };
      }
      const out: Doc = {};
      for (const [k, v] of Object.entries(node as Doc)) out[k] = walk(v);
      return out;
    }
    return node;
  };

  function deepResolve(val: unknown, root: Doc): unknown {
    if (typeof val === 'string') return resolve(val);
    if (Array.isArray(val)) return val.map((v) => deepResolve(v, root));
    if (val && typeof val === 'object') {
      const out: Doc = {};
      for (const [k, v] of Object.entries(val as Doc)) out[k] = deepResolve(v, root);
      return out;
    }
    return val;
  }

  return walk(json) as Doc;
}

// ─── flatten to (path, token) pairs ─────────────────────────────────
function* leaves(node: unknown, trail: string[] = []): Generator<{ path: string[]; token: Token }> {
  if (isToken(node)) {
    yield { path: trail, token: node };
    return;
  }
  if (node && typeof node === 'object' && !Array.isArray(node)) {
    for (const [k, v] of Object.entries(node as Doc)) {
      if (k.startsWith('$')) continue; // skip $schema, $themes, $metadata
      yield* leaves(v, [...trail, k]);
    }
  }
}

// CSS-var name: a.b.c → --a-b-c (lowercased)
const cssVar = (parts: string[]): string =>
  '--' + parts.join('-').toLowerCase().replace(/[^a-z0-9_-]+/g, '-');

// dot-notation key for TS objects
const dotKey = (parts: string[]): string => parts.join('.');

// emit a CSS value from a Token (handles composite types)
function cssValue(t: Token): string {
  const v = t.$value;
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (t.$type === 'typography' && v && typeof v === 'object') {
    // typography is composite — Chakra reads it as object, CSS reads individual fields
    return JSON.stringify(v);
  }
  if (t.$type === 'transition' && v && typeof v === 'object') {
    const tt = v as { duration?: string; timingFunction?: string };
    return `${tt.duration ?? ''} ${tt.timingFunction ?? ''}`.trim();
  }
  return JSON.stringify(v);
}

// ─── main ────────────────────────────────────────────────────────────
async function main() {
  const raw = JSON.parse(await fs.readFile(JSON_IN, 'utf8')) as Doc;
  const resolved = resolveRefs(raw);

  const core = (resolved.core ?? {}) as Doc;
  const motionSet = (resolved.motion ?? {}) as Doc;
  const textStyleSet = (resolved.textStyle ?? {}) as Doc;

  // theme sets：从 $themes 拿名字，第一个为 default
  const themesMeta = ((resolved.$themes as Array<{ id?: string; name: string }>) ?? []) ?? [];
  const themeNames: string[] = themesMeta.length > 0
    ? themesMeta.map((t) => t.id ?? t.name.toLowerCase())
    // 兜底：扫顶层非保留 key
    : Object.keys(resolved).filter((k) =>
        !['core', 'motion', 'textStyle'].includes(k) && !k.startsWith('$'),
      );
  if (themeNames.length === 0) themeNames.push('light');

  const defaultTheme = themeNames[0]!;
  const themePalettes: Record<string, Doc> = {};
  for (const name of themeNames) {
    themePalettes[name] = (resolved[name] ?? {}) as Doc;
  }

  // 拆出 effect 子树（每个 theme 下的 effect.* 单独走 --effect-* CSS 变量）
  const colorsByTheme: Record<string, Doc> = {};
  const effectsByTheme: Record<string, Doc> = {};
  for (const [name, pal] of Object.entries(themePalettes)) {
    const { effect, ...rest } = pal as Doc & { effect?: Doc };
    colorsByTheme[name] = rest;
    effectsByTheme[name] = (effect ?? {}) as Doc;
  }

  // ─── 1. tokens.css ──────────────────────────────────────────────
  const lines: string[] = [
    '/* Auto-generated by apps/web/src/styles/tokens/sync.ts from docs/claude/token.json.',
    '   DO NOT edit by hand. Run `pnpm tokens:sync` after changing token.json. */',
    '',
    ':root {',
  ];
  // core
  for (const { path: p, token } of leaves(core)) {
    lines.push(`  ${cssVar(['core', ...p])}: ${cssValue(token)};`);
  }
  // default theme (first in $themes)
  lines.push(`  /* theme · ${defaultTheme} (default) */`);
  for (const { path: p, token } of leaves(colorsByTheme[defaultTheme]!)) {
    lines.push(`  ${cssVar(p)}: ${cssValue(token)};`);
  }
  for (const { path: p, token } of leaves(effectsByTheme[defaultTheme]!)) {
    lines.push(`  ${cssVar(['effect', ...p])}: ${cssValue(token)};`);
  }
  for (const { path: p, token } of leaves(motionSet)) {
    lines.push(`  ${cssVar(['motion', ...p])}: ${cssValue(token)};`);
  }
  lines.push('}');

  // 其他 theme：data-theme=xxx 选择器
  for (const name of themeNames.slice(1)) {
    lines.push('');
    lines.push(`[data-theme='${name}'] {`);
    for (const { path: p, token } of leaves(colorsByTheme[name]!)) {
      lines.push(`  ${cssVar(p)}: ${cssValue(token)};`);
    }
    for (const { path: p, token } of leaves(effectsByTheme[name]!)) {
      lines.push(`  ${cssVar(['effect', ...p])}: ${cssValue(token)};`);
    }
    lines.push('}');
  }

  // prefers-color-scheme: dark 默认走 dark theme（如果存在）
  if (themeNames.includes('dark')) {
    lines.push('');
    lines.push("@media (prefers-color-scheme: dark) {");
    lines.push("  :root:not([data-theme]) {");
    for (const { path: p, token } of leaves(colorsByTheme.dark!)) {
      lines.push(`    ${cssVar(p)}: ${cssValue(token)};`);
    }
    for (const { path: p, token } of leaves(effectsByTheme.dark!)) {
      lines.push(`    ${cssVar(['effect', ...p])}: ${cssValue(token)};`);
    }
    lines.push("  }");
    lines.push("}");
  }

  await fs.writeFile(CSS_OUT, lines.join('\n') + '\n');
  console.log(`✓ wrote ${path.relative(REPO, CSS_OUT)}`);

  // ─── 2. __generated.ts ─────────────────────────────────────────
  const tsLines: string[] = [
    '/* Auto-generated by apps/web/src/styles/tokens/sync.ts from docs/claude/token.json.',
    '   DO NOT edit by hand. Run `pnpm tokens:sync` after changing token.json. */',
    '/* eslint-disable */',
    '',
  ];

  // helper: emit a nested object literal for tokens, leaves are values
  function emitObject(node: unknown, indent = 2): string {
    if (isToken(node)) return JSON.stringify(node.$value);
    if (node && typeof node === 'object') {
      const entries = Object.entries(node as Doc).filter(([k]) => !k.startsWith('$'));
      if (entries.length === 0) return '{}';
      const lines = entries.map(([k, v]) => {
        const key = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(k) ? k : JSON.stringify(k);
        return ' '.repeat(indent) + `${key}: ${emitObject(v, indent + 2)}`;
      });
      return `{\n${lines.join(',\n')},\n${' '.repeat(indent - 2)}}`;
    }
    return JSON.stringify(node);
  }

  // core
  tsLines.push(`export const core = ${emitObject(core)} as const;`);
  tsLines.push('');
  // for convenience, re-export common slices
  tsLines.push('export const colors = core.color;');
  tsLines.push('export const fonts = core.fontFamily;');
  tsLines.push('export const fontSizes = core.fontSize;');
  tsLines.push('export const fontWeights = core.fontWeight;');
  tsLines.push('export const lineHeights = core.lineHeight;');
  tsLines.push('export const letterSpacings = core.letterSpacing;');
  tsLines.push('export const space = core.space;');
  tsLines.push('export const radii = core.radius;');
  tsLines.push('export const borderWidths = core.borderWidth;');
  tsLines.push('export const shadows = core.shadow;');
  tsLines.push('export const durations = core.duration;');
  tsLines.push('export const easings = core.easing;');
  tsLines.push('');
  // 各 theme 的 colors（不含 effect）
  tsLines.push(`export const themes = {`);
  for (const name of themeNames) {
    tsLines.push(`  ${name}: ${emitObject(colorsByTheme[name]!, 4)},`);
  }
  tsLines.push(`} as const;`);
  // 便捷别名（业务代码读这两个就够）
  for (const name of themeNames) {
    tsLines.push(`export const ${name} = themes.${name};`);
  }
  tsLines.push('');
  tsLines.push(`export const effects = {`);
  for (const name of themeNames) {
    tsLines.push(`  ${name}: ${emitObject(effectsByTheme[name]!, 4)},`);
  }
  tsLines.push(`} as const;`);
  tsLines.push('');
  tsLines.push(`export const motion = ${emitObject(motionSet)} as const;`);
  tsLines.push('');
  tsLines.push(`export const textStyles = ${emitObject(textStyleSet)} as const;`);
  tsLines.push('');

  // transition() helper: kept here because it's pure logic over motion tokens
  tsLines.push(`/** transition('subtle')              -> "all 120ms <easing>" */`);
  tsLines.push(`/** transition('enter', 'opacity')    -> "opacity 200ms <easing>" */`);
  tsLines.push(`export function transition(intent: keyof typeof motion, properties: string | string[] = 'all'): string {`);
  tsLines.push(`  const m = (motion as Record<string, { duration: string; timingFunction: string }>)[intent];`);
  tsLines.push(`  if (!m) return '';`);
  tsLines.push(`  const props = Array.isArray(properties) ? properties.join(', ') : properties;`);
  tsLines.push(`  return \`\${props} \${m.duration} \${m.timingFunction}\`;`);
  tsLines.push(`}`);

  await fs.writeFile(TS_OUT, tsLines.join('\n') + '\n');
  console.log(`✓ wrote ${path.relative(REPO, TS_OUT)}`);

  // ─── 3. design-system.html ──────────────────────────────────────
  await fs.writeFile(
    HTML_OUT,
    buildHtml(
      core,
      colorsByTheme[defaultTheme]!,
      effectsByTheme[defaultTheme]!,
      motionSet,
      textStyleSet,
      themeNames,
      defaultTheme,
    ),
  );
  console.log(`✓ wrote ${path.relative(REPO, HTML_OUT)}`);
}

function buildHtml(
  core: Doc,
  themeColors: Doc,
  themeEffects: Doc,
  motionD: Doc,
  textStyleD: Doc,
  themeNames: string[],
  defaultTheme: string,
): string {
  const isDarkColor = (hex: string): boolean => {
    const m = hex.match(/^#([0-9a-f]{6})/i);
    if (!m) return false;
    const c = m[1]!;
    const r = parseInt(c.slice(0, 2), 16);
    const g = parseInt(c.slice(2, 4), 16);
    const b = parseInt(c.slice(4, 6), 16);
    return (r * 299 + g * 587 + b * 114) / 1000 < 140;
  };

  const rowsFor = (node: Doc, prefix: string) => {
    const rows: string[] = [];
    for (const { path: p, token } of leaves(node)) {
      const value = token.$value;
      const v = typeof value === 'string' ? value : JSON.stringify(value);
      const isColor = typeof value === 'string' && /^#|^rgb/.test(value);
      const preview = isColor
        ? `<span class="chip" style="background:${v}"></span>`
        : '';
      rows.push(`<tr>
        <td><code class="t">${prefix}.${p.join('.')}</code></td>
        <td>${preview}</td>
        <td><code class="v">${escapeHtml(v)}</code></td>
        <td class="d">${escapeHtml(token.$description ?? '')}</td>
      </tr>`);
    }
    return rows.join('');
  };

  const colorScales = Object.entries(core.color as Doc)
    .filter(([k, v]) => typeof v === 'object' && !isToken(v) && k !== 'white' && k !== 'black' && k !== 'transparent')
    .map(([family, scale]) => {
      const swatches = Object.entries(scale as Doc)
        .map(([step, t]) => {
          const tk = t as Token;
          const c = String(tk.$value);
          const dark = isDarkColor(c);
          return `<div class="sw" style="background:${c};color:${dark ? '#fff' : '#000'}">
            <span class="sw-step">${step}</span><code>${c}</code>
          </div>`;
        }).join('');
      return `<section class="block"><h3>${family}</h3><div class="scale">${swatches}</div></section>`;
    }).join('');

  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>Design System</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;500;600&family=Poppins:wght@600&family=JetBrains+Mono:wght@400;500&family=Source+Serif+4:wght@600&display=swap" rel="stylesheet">
<style>
* { box-sizing: border-box; }
body { margin: 0; background: #FAFAF9; color: #1C1917; font-family: 'Open Sans', system-ui, sans-serif; font-size: 14px; line-height: 1.5; -webkit-font-smoothing: antialiased; }
.app { max-width: 1080px; margin: 0 auto; padding: 56px 32px 80px; }
.brand { display: flex; align-items: baseline; gap: 16px; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid #E7E5E4; }
.brand h1 { font-family: 'Poppins'; font-weight: 600; font-size: 30px; margin: 0; letter-spacing: -0.02em; }
.brand .sub { color: #78716C; font-family: 'JetBrains Mono'; font-size: 12px; }
.intro { background: #FFF; border: 1px solid #E7E5E4; border-radius: 10px; padding: 20px 24px; margin: 32px 0 56px; font-size: 14px; line-height: 1.65; color: #57534E; }
.intro b { color: #1C1917; }
.intro code { font-family: 'JetBrains Mono'; font-size: 12px; background: #F5F5F4; padding: 1px 6px; border-radius: 3px; }
h2.section { font-family: 'Source Serif 4'; font-weight: 600; font-size: 26px; margin: 56px 0 20px; padding-bottom: 10px; border-bottom: 1px solid #E7E5E4; letter-spacing: -0.01em; }
.block { margin-bottom: 36px; }
.block h3 { font-family: 'Open Sans'; font-weight: 600; font-size: 16px; margin: 0 0 12px; color: #57534E; }
.scale { display: grid; grid-template-columns: repeat(auto-fill, minmax(80px, 1fr)); gap: 1px; border: 1px solid #E7E5E4; background: #E7E5E4; border-radius: 6px; overflow: hidden; }
.sw { padding: 12px 8px 8px; display: flex; flex-direction: column; gap: 2px; }
.sw-step { font-family: 'Open Sans'; font-weight: 600; font-size: 12px; }
.sw code { font-family: 'JetBrains Mono'; font-size: 10px; opacity: 0.75; }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
table td { padding: 7px 10px; border-bottom: 1px solid #F5F5F4; vertical-align: middle; }
table td:first-child { width: 38%; }
table td:nth-child(2) { width: 56px; }
table td:nth-child(3) { width: 22%; }
table td:nth-child(4) { color: #78716C; font-size: 12px; }
code.t { font-family: 'JetBrains Mono'; font-size: 12px; color: #1C1917; font-weight: 500; }
code.v { font-family: 'JetBrains Mono'; font-size: 11px; color: #57534E; }
.chip { display: inline-block; width: 28px; height: 16px; border-radius: 3px; border: 1px solid #E7E5E4; vertical-align: middle; }
.d { color: #78716C; }
</style></head><body>
<div class="app">
<header class="brand">
  <h1>Design System</h1>
  <span class="sub">generated from docs/claude/token.json · DTCG</span>
</header>

<div class="intro">
  <p><b>token.json</b> 是这套设计系统的唯一真实来源（W3C DTCG 格式 · 兼容 Figma Tokens Studio）。</p>
  <p>三层：<b>core</b>（原料）→ <b>semantic</b>（语义化，按 theme 区分）→ <b>textStyle / motion / effects</b>（组合 token）。</p>
  <p>业务代码用 <code>__generated.ts</code> 里的 semantic / textStyle / motion，不直接用 core。</p>
  <p>修改流程：改 <code>token.json</code>（或由设计师在 Figma Tokens Studio 改 → push 分支）→ 跑 <code>pnpm tokens:sync</code> → CSS + TS + 本文档自动更新。</p>
</div>

<h2 class="section">theme · ${defaultTheme}（default）${themeNames.length > 1 ? ` · 其他 theme: ${themeNames.slice(1).join(', ')}` : ''}</h2>
${Object.entries(themeColors as Doc).map(([g, v]) =>
  `<section class="block"><h3>${g}</h3><table>${rowsFor(v as Doc, g)}</table></section>`,
).join('')}

<h2 class="section">effect · ${defaultTheme}</h2>
<table>${rowsFor(themeEffects as Doc, 'effect')}</table>

<h2 class="section">textStyle</h2>
<table>${rowsFor(textStyleD, 'textStyle')}</table>

<h2 class="section">motion</h2>
<table>${rowsFor(motionD, 'motion')}</table>

<h2 class="section">core · color scales</h2>
${colorScales}

<h2 class="section">core · 其他</h2>
${['fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'space', 'radius', 'borderWidth', 'shadow', 'duration', 'easing'].map((k) => {
  const node = (core[k] ?? {}) as Doc;
  return `<section class="block"><h3>core.${k}</h3><table>${rowsFor(node, `core.${k}`)}</table></section>`;
}).join('')}

<footer style="margin-top:80px;padding-top:20px;border-top:1px solid #E7E5E4;font-family:'JetBrains Mono';font-size:11px;color:#78716C">
  生成自 <code>docs/claude/token.json</code> · 修改后跑 <code>pnpm tokens:sync</code>
</footer>
</div></body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
