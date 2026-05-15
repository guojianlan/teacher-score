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
import { spawnSync } from 'node:child_process';
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
  // 校验 token.json 结构，任何违规 abort
  const validateScript = path.join(REPO, 'scripts/validate-tokens.ts');
  const validation = spawnSync('npx', ['tsx', validateScript], { cwd: REPO, stdio: 'inherit' });
  if (validation.status !== 0) {
    console.error('\n✗ token.json 校验失败，sync aborted。修了再来。');
    process.exit(1);
  }

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
      { colorsByTheme, effectsByTheme },
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
  allThemes: { colorsByTheme: Record<string, Doc>; effectsByTheme: Record<string, Doc> },
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

  // 把所有 theme 的 CSS 变量一起 inline 进 design-system.html，
  // 让独立打开（file://）也能切换。
  const inlineThemeVars: string[] = [':root {'];
  // default (first theme) at :root
  for (const { path: p, token } of leaves(themeColors)) {
    inlineThemeVars.push(`  --${p.join('-').toLowerCase()}: ${typeof token.$value === 'string' ? token.$value : ''};`);
  }
  for (const { path: p, token } of leaves(themeEffects)) {
    inlineThemeVars.push(`  --effect-${p.join('-').toLowerCase()}: ${typeof token.$value === 'string' ? token.$value : ''};`);
  }
  inlineThemeVars.push('}');
  for (const name of themeNames.slice(1)) {
    const otherColors = (allThemes?.colorsByTheme?.[name] ?? {}) as Doc;
    const otherEffects = (allThemes?.effectsByTheme?.[name] ?? {}) as Doc;
    inlineThemeVars.push(`[data-theme='${name}'] {`);
    for (const { path: p, token } of leaves(otherColors)) {
      inlineThemeVars.push(`  --${p.join('-').toLowerCase()}: ${typeof token.$value === 'string' ? token.$value : ''};`);
    }
    for (const { path: p, token } of leaves(otherEffects)) {
      inlineThemeVars.push(`  --effect-${p.join('-').toLowerCase()}: ${typeof token.$value === 'string' ? token.$value : ''};`);
    }
    inlineThemeVars.push('}');
  }

  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>Design System</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;500;600&family=Poppins:wght@600&family=JetBrains+Mono:wght@400;500&family=Source+Serif+4:wght@600&display=swap" rel="stylesheet">
<style>
${inlineThemeVars.join('\n')}
</style>
<style>
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg-canvas); color: var(--fg-default); font-family: 'Open Sans', system-ui, sans-serif; font-size: 14px; line-height: 1.5; -webkit-font-smoothing: antialiased; }
.app { max-width: 1080px; margin: 0 auto; padding: 56px 32px 80px; }
.brand { display: flex; align-items: baseline; gap: 16px; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid var(--border-default); }
.brand h1 { font-family: 'Poppins'; font-weight: 600; font-size: 30px; margin: 0; letter-spacing: -0.02em; }
.brand .sub { color: var(--fg-subtle); font-family: 'JetBrains Mono'; font-size: 12px; }
.intro { background: var(--bg-surface); border: 1px solid var(--border-default); border-radius: 10px; padding: 20px 24px; margin: 32px 0 56px; font-size: 14px; line-height: 1.65; color: var(--fg-muted); }
.intro b { color: var(--fg-default); }
.intro code { font-family: 'JetBrains Mono'; font-size: 12px; background: var(--bg-muted); padding: 1px 6px; border-radius: 3px; }
h2.section { font-family: 'Source Serif 4'; font-weight: 600; font-size: 26px; margin: 56px 0 20px; padding-bottom: 10px; border-bottom: 1px solid var(--border-default); letter-spacing: -0.01em; }
.block { margin-bottom: 36px; }
.block h3 { font-family: 'Open Sans'; font-weight: 600; font-size: 16px; margin: 0 0 12px; color: var(--fg-muted); }
.scale { display: grid; grid-template-columns: repeat(auto-fill, minmax(80px, 1fr)); gap: 1px; border: 1px solid var(--border-default); background: var(--border-default); border-radius: 6px; overflow: hidden; }
.sw { padding: 12px 8px 8px; display: flex; flex-direction: column; gap: 2px; }
.sw-step { font-family: 'Open Sans'; font-weight: 600; font-size: 12px; }
.sw code { font-family: 'JetBrains Mono'; font-size: 10px; opacity: 0.75; }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
table td { padding: 7px 10px; border-bottom: 1px solid var(--border-subtle); vertical-align: middle; }
table td:first-child { width: 38%; }
table td:nth-child(2) { width: 56px; }
table td:nth-child(3) { width: 22%; }
table td:nth-child(4) { color: var(--fg-subtle); font-size: 12px; }
code.t { font-family: 'JetBrains Mono'; font-size: 12px; color: var(--fg-default); font-weight: 500; }
code.v { font-family: 'JetBrains Mono'; font-size: 11px; color: var(--fg-muted); }
.chip { display: inline-block; width: 28px; height: 16px; border-radius: 3px; border: 1px solid var(--border-default); vertical-align: middle; }
.d { color: var(--fg-subtle); }

/* ── 设计原则卡片 ── */
.principles { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin: 24px 0 40px; }
.principle { background: var(--bg-surface); border: 1px solid var(--border-default); border-radius: 8px; padding: 14px 16px; }
.principle-h { font-family: 'JetBrains Mono'; font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--fg-subtle); margin: 0 0 6px; }
.principle-b { font-size: 13px; line-height: 1.55; color: var(--fg-default); margin: 0; }

/* ── palette 卡片：8 swatch + 真实预览 ── */
.palette-showcase { display: grid; grid-template-columns: 1fr; gap: 24px; }
.palette-card { background: var(--bg-surface); border: 1px solid var(--border-default); border-radius: 10px; padding: 18px 20px; }
.palette-card-h { display: flex; align-items: baseline; gap: 12px; margin: 0 0 14px; }
.palette-card-h .name { font-family: 'JetBrains Mono'; font-size: 14px; font-weight: 600; }
.palette-card-h .use { color: var(--fg-subtle); font-size: 12px; }
.keys { display: grid; grid-template-columns: repeat(8, 1fr); gap: 4px; margin-bottom: 16px; }
.key { aspect-ratio: 1.6; border-radius: 5px; display: flex; flex-direction: column; justify-content: flex-end; padding: 6px 8px; font-family: 'JetBrains Mono'; font-size: 10px; line-height: 1.2; }
.key-label { font-weight: 600; }
.key-val { opacity: 0.7; font-size: 9px; }
.preview-buttons { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.demo-btn { font-family: 'Open Sans'; font-size: 13px; font-weight: 500; padding: 8px 14px; border-radius: 6px; border: 1px solid transparent; cursor: pointer; transition: filter 0.1s; }
.demo-btn:hover { filter: brightness(0.95); }
.demo-card { padding: 10px 14px; border-radius: 6px; font-size: 13px; }

/* ── textStyle 样本 ── */
.typo-row { display: grid; grid-template-columns: 180px 1fr; gap: 16px; padding: 16px 0; border-bottom: 1px solid var(--border-subtle); align-items: baseline; }
.typo-row:last-child { border-bottom: none; }
.typo-meta { font-family: 'JetBrains Mono'; font-size: 11px; color: var(--fg-subtle); line-height: 1.5; }
.typo-meta b { color: var(--fg-default); font-weight: 600; }
.typo-sample { color: var(--fg-default); }

/* ── 命令速查 ── */
.cheatsheet { background: var(--bg-surface); border: 1px solid var(--border-default); border-radius: 10px; padding: 18px 22px; margin-top: 24px; }
.cheatsheet h3 { font-family: 'Open Sans'; font-weight: 600; font-size: 14px; margin: 0 0 12px; }
.cheatsheet table { font-size: 12px; }
.cheatsheet td:first-child { width: 38%; font-family: 'JetBrains Mono'; color: var(--fg-default); }
.cheatsheet td:last-child { color: var(--fg-muted); }
.links { display: flex; gap: 14px; flex-wrap: wrap; margin: 20px 0 0; font-size: 12px; font-family: 'JetBrains Mono'; }
.links a { color: var(--fg-subtle); text-decoration: none; padding: 4px 10px; border: 1px solid var(--border-default); border-radius: 5px; }
.links a:hover { color: var(--fg-default); border-color: var(--fg-muted); }
</style></head><body>
<div class="app">
<header class="brand">
  <h1>Design System</h1>
  <span class="sub">generated from docs/claude/token.json · DTCG</span>
  <span style="margin-left:auto;display:inline-flex;gap:8px;align-items:center;font-family:'JetBrains Mono';font-size:12px">
    <label for="theme-pick">theme</label>
    <select id="theme-pick" onchange="(function(v){if(v==='light')document.documentElement.removeAttribute('data-theme');else document.documentElement.setAttribute('data-theme',v)})(this.value)" style="font-family:'JetBrains Mono';padding:4px 8px;border-radius:6px;border:1px solid var(--border-default);background:var(--bg-surface);color:var(--fg-default)">
      ${themeNames.map((n) => `<option value="${n}">${n}</option>`).join('')}
    </select>
  </span>
</header>

<div class="intro">
  <p><b>token.json</b> 是这套设计系统的唯一真实来源（W3C DTCG · Figma Tokens Studio 直读）。本页**自动生成**自该 JSON，跑 <code>pnpm tokens:sync</code> 重生成。</p>
  <p>三层：<b>core</b>（11 档色阶等原料）→ <b>palette + bg/fg/border</b>（语义化，按 theme 区分）→ <b>textStyle / motion / effect</b>（组合 token）。</p>
  <p>业务代码只用 semantic 层：<code>&lt;Button colorPalette="primary"&gt;</code> · <code>color="fg.default"</code> · <code>textStyle="cardTitle"</code>。<b>不要</b>直接用 <code>blue.500</code> / <code>#xxx</code>，ESLint 拦。</p>
</div>

<h2 class="section">设计原则</h2>
<div class="principles">
  <div class="principle">
    <p class="principle-h">8 keys per palette</p>
    <p class="principle-b">每个 palette 8 个语义槽：solid · contrast · fg · subtle · muted · emphasized · border · focusRing。源自 Chakra v3 源码实测。</p>
  </div>
  <div class="principle">
    <p class="principle-h">5 默认 palettes</p>
    <p class="principle-b">primary / neutral / success / warning / danger。secondary/info/其他色族 opt-in（<code>pnpm tokens:add-color</code>）。</p>
  </div>
  <div class="principle">
    <p class="principle-h">3 themes</p>
    <p class="principle-b">light / dark / sepia。<code>data-theme</code> 属性 + CSS 变量切换。Chakra 通过 <code>var(--xxx)</code> 引用，无主题二分。</p>
  </div>
  <div class="principle">
    <p class="principle-h">OKLCH from hue</p>
    <p class="principle-b">设计师给 1 个 hex 提供"色相"，算法生成 11 档色阶（固定 L/C 曲线）。输入 hex 不一定等于 500 档。</p>
  </div>
  <div class="principle">
    <p class="principle-h">Contrast 自动选</p>
    <p class="principle-b">每个 palette 的 contrast 键按对 solid 的 WCAG 对比度自动选 white / near-black，避免硬编码白色撞色。</p>
  </div>
  <div class="principle">
    <p class="principle-h">WCAG 审计</p>
    <p class="principle-b">text 对比 ≥4.5:1 + focusRing ≥3:1 为 ERROR（CI 必挂）；border vs bg 为 WARN。跑 <code>pnpm tokens:audit</code>。</p>
  </div>
</div>

<h2 class="section">5 个标准 palette</h2>
<p style="color:var(--fg-subtle);font-size:13px;margin:0 0 20px;">每个 palette 的 8 键 + 真实按钮样例（在当前主题下）。</p>
<div class="palette-showcase">
${(() => {
  const palette = (themeColors as Doc).palette as Doc | undefined;
  if (!palette) return '<p style="color:var(--fg-subtle)">无 palette 数据</p>';
  const purposeMap: Record<string, string> = {
    primary:   '主操作色 · 主按钮 / 链接 / 强调',
    neutral:   '中性色 · 次按钮 / 卡片 / 边线 / 占位',
    success:   '成功色 · 通过 / 保存成功 / 已完成',
    warning:   '警告色 · 注意 / 配额低 / 待处理',
    danger:    '错误色 · 删除 / 注销 / 失败',
    secondary: '品牌副色 (opt-in)',
    info:      '信息色 (opt-in)',
  };
  return Object.entries(palette).map(([name, val]) => {
    const p = val as Doc;
    const keys = ['solid', 'contrast', 'fg', 'subtle', 'muted', 'emphasized', 'border', 'focusRing'];
    const swatches = keys.map((k) => {
      const t = p[k] as Token | undefined;
      const hex = t?.$value as string | undefined ?? '#000';
      const txtColor = isDarkColor(hex) ? '#fff' : '#000';
      return `<div class="key" style="background:${hex};color:${txtColor};">
        <span class="key-label">${k}</span>
        <span class="key-val">${typeof hex === 'string' ? hex.toUpperCase() : ''}</span>
      </div>`;
    }).join('');
    const solidHex = (p.solid as Token | undefined)?.$value as string | undefined;
    const contrastHex = (p.contrast as Token | undefined)?.$value as string | undefined;
    const fgHex = (p.fg as Token | undefined)?.$value as string | undefined;
    const subtleHex = (p.subtle as Token | undefined)?.$value as string | undefined;
    const borderHex = (p.border as Token | undefined)?.$value as string | undefined;
    return `<div class="palette-card">
      <div class="palette-card-h">
        <span class="name">${name}</span>
        <span class="use">${purposeMap[name] ?? ''}</span>
      </div>
      <div class="keys">${swatches}</div>
      <div class="preview-buttons">
        <button class="demo-btn" style="background:${solidHex};color:${contrastHex};">主操作</button>
        <button class="demo-btn" style="background:transparent;color:${fgHex};border-color:${borderHex};">描边按钮</button>
        <button class="demo-btn" style="background:transparent;color:${fgHex};">幽灵按钮</button>
        <span class="demo-card" style="background:${subtleHex};color:${fgHex};border:1px solid ${borderHex};">浅底卡片 · ${name}.subtle</span>
      </div>
    </div>`;
  }).join('');
})()}
</div>

<h2 class="section">Typography · 10 种 textStyle</h2>
<p style="color:var(--fg-subtle);font-size:13px;margin:0 0 20px;">每行：左边 token 元数据；右边实际渲染样例。用法：<code>&lt;Heading textStyle="display"&gt;</code></p>
${(() => {
  const styles = textStyleD;
  const sampleText: Record<string, string> = {
    display:      '一张照片，批改完成',
    pageTitle:    '学情报告 · 第 12 周',
    sectionTitle: '本周错题归集',
    cardTitle:    '函数与导数',
    bodyLg:       '老师拍照上传，多模态模型识别题目并判分。',
    body:         '每一道错题被静默归档，按知识点排序，按重复次数排序。',
    bodySm:       '辅助说明：第二次同卷直接对照判分。',
    label:        '题目编号',
    mono:         'questionHash · 0x4f3d',
    overline:     'features',
  };
  return Object.entries(styles).map(([name, val]) => {
    const v = (val as Token).$value as Record<string, unknown>;
    const cssDecl = Object.entries(v).map(([prop, propVal]) => {
      const k = prop.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
      return `${k}: ${propVal}`;
    }).join('; ');
    const text = sampleText[name] ?? name;
    return `<div class="typo-row">
      <div class="typo-meta">
        <b>${name}</b><br>
        ${(v.fontSize as string) ?? ''} · ${(v.fontWeight as number | string) ?? 400}<br>
        line-height ${(v.lineHeight as number | string) ?? '—'}
      </div>
      <div class="typo-sample" style="${cssDecl}">${text}</div>
    </div>`;
  }).join('');
})()}

<h2 class="section">theme · ${defaultTheme}（default）${themeNames.length > 1 ? ` · 其他 theme: ${themeNames.slice(1).join(', ')}` : ''}</h2>
<p style="color:var(--fg-subtle);font-size:13px;margin:0 0 16px;">底层 token 引用（按 group 列）。切换右上角 theme 看其他主题的解析结果。</p>
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

<h2 class="section">命令速查</h2>
<div class="cheatsheet">
  <h3>日常命令</h3>
  <table>
    <tr><td>pnpm tokens:sync</td><td>校验 + 生成 CSS / TS / 本页（每次改完 token.json 跑）</td></tr>
    <tr><td>pnpm tokens:validate</td><td>只校验结构（3 主题、8 键齐全、refs 解析、palette ≤8）</td></tr>
    <tr><td>pnpm tokens:audit</td><td>WCAG 对比度审计，ERROR 挂 CI</td></tr>
    <tr><td>pnpm tokens:audit --palette=primary</td><td>只审某个 palette</td></tr>
    <tr><td>pnpm tokens:audit --strict</td><td>用 AAA 标准（默认 AA）</td></tr>
    <tr><td>pnpm tokens:audit --verbose</td><td>显示所有 WARN 明细</td></tr>
  </table>
  <h3 style="margin-top:18px;">扩展系统</h3>
  <table>
    <tr><td>pnpm tokens:add-color violet "#8B5CF6"</td><td>加新色族：OKLCH 生 11 档 + 8 键 × 3 主题</td></tr>
    <tr><td>pnpm tokens:palette mint green</td><td>已有色族起别名为新 palette</td></tr>
  </table>
  <h3 style="margin-top:18px;">业务代码用法</h3>
  <table>
    <tr><td>&lt;Button colorPalette="primary"&gt;</td><td>主操作（自动 8 键解析 + 主题切换）</td></tr>
    <tr><td>&lt;Box bg="bg.surface" color="fg.default"&gt;</td><td>标准卡片底色 + 默认文字</td></tr>
    <tr><td>&lt;Heading textStyle="display"&gt;</td><td>预定义文字样式</td></tr>
    <tr><td>&lt;Box bg="primary.subtle" borderColor="primary.border"&gt;</td><td>直接读 palette 子键（受控场景）</td></tr>
  </table>
  <div class="links">
    <a href="DESIGN-TOKENS-SPEC.md">📐 完整规范 DESIGN-TOKENS-SPEC.md</a>
    <a href="DESIGN-TOKENS-DISCUSSION.md">💬 Claude vs Codex 共识记录</a>
    <a href="design-lab.html">🎨 调色 Lab（OKLCH 实时预览）</a>
    <a href="token.json">📄 token.json 真源</a>
  </div>
</div>

<footer style="margin-top:60px;padding-top:20px;border-top:1px solid var(--border-default);font-family:'JetBrains Mono';font-size:11px;color:var(--fg-subtle);">
  生成自 <code>docs/claude/token.json</code> · 修改后跑 <code>pnpm tokens:sync</code> · 本页不进 git，每次重生成
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
