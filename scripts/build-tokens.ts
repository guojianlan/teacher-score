#!/usr/bin/env tsx
/**
 * scripts/build-tokens.ts
 *
 * Reads docs/claude/token.json (Slidepilot V1 design system) and produces:
 *   - apps/web/src/styles/tokens.css   — CSS variables, single source of truth
 *   - docs/claude/design-system.html   — self-contained visual reference
 *
 * Re-run after editing token.json.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');
const TOKEN_FILE = path.join(ROOT, 'docs/claude/token.json');
const CSS_OUT = path.join(ROOT, 'apps/web/src/styles/tokens.css');
const HTML_OUT = path.join(ROOT, 'docs/claude/design-system.html');

interface Token {
  $type?: string;
  $value?: unknown;
  [k: string]: unknown;
}

type Doc = Record<string, unknown>;

async function main() {
  const raw = JSON.parse(await fs.readFile(TOKEN_FILE, 'utf8')) as Doc;
  const global = raw.global as Doc;
  const v1 = raw['Slidepilot V1'] as Doc;

  // ── 1. Resolve all leaf values (strings or numbers) under global.* ─────
  const flat: Record<string, string> = {};
  const visit = (node: unknown, trail: string[]) => {
    if (!node || typeof node !== 'object') return;
    const t = node as Token;
    if (t.$value !== undefined) {
      flat[trail.join('.')] = String(t.$value);
      return;
    }
    for (const [k, v] of Object.entries(node as Doc)) {
      visit(v, [...trail, k]);
    }
  };
  visit(global, []);

  // Resolve refs like "{gray.100}" to actual values, recursively.
  const resolve = (val: string, seen = new Set<string>()): string => {
    const m = val.match(/^\{([^}]+)\}$/);
    if (!m) return val;
    const key = m[1]!;
    if (seen.has(key)) return val;
    seen.add(key);
    const next = flat[key];
    if (!next) return val;
    return resolve(next, seen);
  };

  // ── 2. Build CSS variables ────────────────────────────────────────────
  const lines: string[] = [
    '/* Auto-generated from docs/claude/token.json — do not edit by hand.',
    '   Run `pnpm tokens:build` (or `tsx scripts/build-tokens.ts`) to regenerate. */',
    '',
    ':root {',
  ];

  const cssVarName = (path: string) =>
    `--${path.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9_-]+/g, '-')}`;

  // Color scales from global
  for (const family of [
    'gray', 'red', 'pink', 'purple', 'cyan', 'blue', 'teal',
    'green', 'orange', 'yellow', 'whiteAlpha', 'blackAlpha', 'purpleBlue',
  ]) {
    lines.push(`  /* ${family} */`);
    for (const [k, v] of Object.entries((global[family] ?? {}) as Doc)) {
      const t = v as Token;
      if (t.$value !== undefined) {
        lines.push(`  ${cssVarName(`${family}-${k}`)}: ${t.$value as string};`);
      }
    }
  }

  // Typography
  lines.push(`  /* font sizes */`);
  for (const [k, v] of Object.entries((global.fontSizes ?? {}) as Doc)) {
    const t = v as Token;
    if (t.$value !== undefined) {
      const val = String(t.$value);
      lines.push(`  ${cssVarName(`fs-${k}`)}: ${/^\d+(\.\d+)?$/.test(val) ? val + 'px' : val};`);
    }
  }
  lines.push(`  /* font weights */`);
  for (const [k, v] of Object.entries((global.fontWeights ?? {}) as Doc)) {
    const t = v as Token;
    if (t.$value !== undefined) lines.push(`  ${cssVarName(`fw-${k}`)}: ${t.$value as string};`);
  }
  lines.push(`  /* radii */`);
  for (const [k, v] of Object.entries((global.Radii as Doc)?.Global_tokens ?? {})) {
    const t = v as Token;
    if (t.$value !== undefined) {
      const val = String(t.$value);
      lines.push(`  ${cssVarName(`radius-${k}`)}: ${/^\d+(\.\d+)?$/.test(val) ? val + 'px' : val};`);
    }
  }
  lines.push(`  /* spacing */`);
  for (const [k, v] of Object.entries((global.Spacing ?? {}) as Doc)) {
    const t = v as Token;
    if (t.$value !== undefined) {
      const val = String(t.$value);
      lines.push(`  ${cssVarName(`space-${k}`)}: ${/^\d+(\.\d+)?$/.test(val) ? val + 'px' : val};`);
    }
  }
  lines.push(`  /* border widths */`);
  for (const [k, v] of Object.entries((global.Borders ?? {}) as Doc)) {
    const t = v as Token;
    if (t.$value !== undefined) {
      const val = String(t.$value);
      lines.push(`  ${cssVarName(`border-w-${k}`)}: ${/^\d+(\.\d+)?$/.test(val) ? val + 'px' : val};`);
    }
  }
  lines.push(`  /* fonts (token names mapped to web-loadable stacks) */`);
  lines.push(`  --font-heading: 'Open Sans', system-ui, sans-serif;`);
  lines.push(`  --font-body: 'Open Sans', system-ui, sans-serif;`);
  lines.push(`  --font-display: 'Poppins', system-ui, sans-serif;`);
  lines.push(`  --font-serif: 'Source Serif 4', Georgia, serif;`);
  lines.push(`  --font-mono: 'Figtree', ui-monospace, SFMono-Regular, monospace;`);

  // V1 semantic tokens (resolved)
  const semantic: Record<string, Record<string, string>> = {};
  for (const [group, items] of Object.entries(v1)) {
    if (typeof items !== 'object' || items === null) continue;
    if (Array.isArray(items)) continue;
    semantic[group] = {};
    for (const [k, v] of Object.entries(items as Doc)) {
      const t = v as Token;
      if (t.$value !== undefined) {
        const resolved = resolve(String(t.$value));
        semantic[group]![k] = resolved;
        lines.push(`  ${cssVarName(`${group}-${k}`)}: ${resolved};`);
      }
    }
  }

  lines.push('}');
  lines.push('');
  await fs.mkdir(path.dirname(CSS_OUT), { recursive: true });
  await fs.writeFile(CSS_OUT, lines.join('\n'));
  console.log(`✓ wrote ${CSS_OUT}`);

  // ── 3. Build HTML design reference ────────────────────────────────────
  const html = buildHtml(global, semantic, flat, resolve);
  await fs.mkdir(path.dirname(HTML_OUT), { recursive: true });
  await fs.writeFile(HTML_OUT, html);
  console.log(`✓ wrote ${HTML_OUT}`);
}

function buildHtml(
  global: Doc,
  semantic: Record<string, Record<string, string>>,
  flat: Record<string, string>,
  resolve: (v: string) => string,
): string {
  const scale = (family: string): string => {
    const items = global[family] as Doc;
    if (!items) return '';
    const swatches = Object.entries(items)
      .map(([k, v]) => {
        const t = v as Token;
        if (t.$value === undefined) return '';
        const c = String(t.$value);
        const dark = isDark(c);
        return `<div class="sw" style="background:${c};color:${dark ? '#fff' : '#000'}"><span>${k}</span><code>${c}</code></div>`;
      })
      .join('');
    return `<section class="block">
      <h3>${family}</h3>
      <div class="scale">${swatches}</div>
    </section>`;
  };

  const semanticBlock = (group: string) => {
    const items = semantic[group];
    if (!items) return '';
    const rows = Object.entries(items)
      .map(([k, v]) => {
        // resolve again to current hex for display
        const hex = v.startsWith('{') ? resolve(v) : v;
        const isColor = /^#|^rgb/.test(hex);
        const preview = isColor
          ? `<span class="chip" style="background:${hex}"></span>`
          : `<span class="num">${hex}</span>`;
        return `<tr><td><code>${group}.${k}</code></td><td>${preview}</td><td><code>${hex}</code></td></tr>`;
      })
      .join('');
    return `<section class="block">
      <h3>${group}</h3>
      <table>${rows}</table>
    </section>`;
  };

  const sizeBlock = (name: string, key: string) => {
    const items = (global[key] ?? (global.Radii as Doc)?.[key] ?? {}) as Doc;
    const rows = Object.entries(items)
      .map(([k, v]) => {
        const t = v as Token;
        if (t.$value === undefined) return '';
        const val = String(t.$value);
        return `<tr><td><code>${name}.${k}</code></td><td class="num">${val}${/^\d+(\.\d+)?$/.test(val) ? 'px' : ''}</td></tr>`;
      })
      .join('');
    return `<section class="block">
      <h3>${name}</h3>
      <table class="numbers">${rows}</table>
    </section>`;
  };

  const radiiBlock = () => {
    const r = ((global.Radii as Doc)?.Global_tokens ?? {}) as Doc;
    const rows = Object.entries(r)
      .map(([k, v]) => {
        const t = v as Token;
        const val = String(t.$value);
        return `<div class="radius-card" style="border-radius:${val}px">
          <span>${k}</span><code>${val}px</code>
        </div>`;
      })
      .join('');
    return `<section class="block"><h3>radii</h3><div class="radii-row">${rows}</div></section>`;
  };

  const typeSpecimen = () => {
    const sizes: Array<[string, string]> = [];
    for (const [k, v] of Object.entries((global.fontSizes ?? {}) as Doc)) {
      const t = v as Token;
      if (t.$value !== undefined) sizes.push([k, String(t.$value)]);
    }
    return `<section class="block">
      <h3>typography</h3>
      <div class="spec">
        ${sizes.map(([k, v]) => `
          <div class="spec-row">
            <code class="spec-name">${k} · ${v}px</code>
            <div class="spec-text" style="font-size:${v}px">老师批改 — Teacher Score</div>
          </div>
        `).join('')}
      </div>
      <h4 style="margin-top:32px">font families</h4>
      <div class="spec">
        <div class="spec-row"><code class="spec-name">heading / body — Open Sans</code><div class="spec-text" style="font-family:'Open Sans';font-size:24px">教师批改 SaaS · Teacher Score</div></div>
        <div class="spec-row"><code class="spec-name">display — Poppins</code><div class="spec-text" style="font-family:'Poppins';font-size:24px;font-weight:600">教师批改 SaaS · Teacher Score</div></div>
        <div class="spec-row"><code class="spec-name">serif — Source Serif 4</code><div class="spec-text" style="font-family:'Source Serif 4';font-size:24px">教师批改 SaaS · Teacher Score</div></div>
        <div class="spec-row"><code class="spec-name">mono — Figtree</code><div class="spec-text" style="font-family:'Figtree';font-size:20px">grade_12345 · gpt-5.5</div></div>
      </div>
    </section>`;
  };

  const componentSamples = () => `
    <section class="block">
      <h3>components</h3>
      <div class="components">
        <div class="card">
          <p class="eyebrow">EYEBROW · Section Label</p>
          <h4 class="card-title">这是一个标题</h4>
          <p class="card-body">正文使用 text.fgSubtle (#666666)。卡片用 bg.panel + border.base。</p>
          <div style="margin-top:16px;display:flex;gap:8px">
            <button class="btn btn-primary">主操作</button>
            <button class="btn btn-secondary">次操作</button>
            <button class="btn btn-ghost">幽灵按钮</button>
          </div>
        </div>
        <div class="status-row">
          <span class="badge badge-info">info</span>
          <span class="badge badge-success">success</span>
          <span class="badge badge-warning">warning</span>
          <span class="badge badge-error">error</span>
          <span class="badge badge-neutral">neutral</span>
        </div>
      </div>
    </section>
  `;

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>Design System — 教师批改 SaaS</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;500;600;700&family=Poppins:wght@400;500;600;700&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&family=Figtree:wght@400;500;600&display=swap" rel="stylesheet">
<style>
:root {
${Object.entries(semantic).flatMap(([g, items]) =>
  Object.entries(items).map(([k, v]) => `  --${g}-${k}: ${v};`),
).join('\n')}
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: ${semantic.bg?.page ?? '#F7F6F2'};
  color: ${semantic.text?.fg ?? '#141413'};
  font-family: 'Open Sans', system-ui, sans-serif;
  font-size: 15px;
  line-height: 1.55;
  -webkit-font-smoothing: antialiased;
}
.app { max-width: 1100px; margin: 0 auto; padding: 56px 32px 80px; }
.brand { display: flex; align-items: baseline; gap: 12px; margin-bottom: 40px; padding-bottom: 24px; border-bottom: 1px solid ${semantic.border?.base ?? '#e5e5e5'}; }
.brand h1 { font-family: 'Poppins'; font-weight: 600; font-size: 32px; margin: 0; letter-spacing: -0.01em; }
.brand .sub { color: ${semantic.text?.fgSubtext ?? '#999'}; font-family: 'Figtree'; font-size: 13px; }
.toc { display: flex; flex-wrap: wrap; gap: 16px 24px; margin-bottom: 56px; font-family: 'Figtree'; font-size: 13px; }
.toc a { color: ${semantic.blue?.solid ?? '#4263EB'}; text-decoration: none; }
.toc a:hover { text-decoration: underline; }
.block { margin-bottom: 64px; }
.block h3 { font-family: 'Source Serif 4'; font-weight: 600; font-size: 22px; margin: 0 0 16px; letter-spacing: -0.01em; }
.block h4 { font-family: 'Source Serif 4'; font-weight: 600; font-size: 17px; margin: 0 0 12px; }
.scale {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
  gap: 1px;
  border: 1px solid ${semantic.border?.base ?? '#e5e5e5'};
  background: ${semantic.border?.base ?? '#e5e5e5'};
  border-radius: 8px;
  overflow: hidden;
}
.sw { padding: 14px 12px 12px; display: flex; flex-direction: column; gap: 2px; font-size: 12px; }
.sw span { font-family: 'Figtree'; font-weight: 500; }
.sw code { font-family: 'Figtree'; font-size: 11px; opacity: 0.7; }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
table td { padding: 8px 12px; border-bottom: 1px solid ${semantic.border?.subtle ?? '#f3f4f6'}; vertical-align: middle; }
table td:first-child code { font-family: 'Figtree'; font-weight: 500; color: ${semantic.text?.fgMuted ?? '#333'}; }
table td code { font-family: 'Figtree'; font-size: 12px; color: ${semantic.text?.fgSubtle ?? '#666'}; }
.chip { display: inline-block; width: 28px; height: 16px; border-radius: 3px; border: 1px solid ${semantic.border?.muted ?? '#ebebeb'}; vertical-align: middle; }
.num { font-family: 'Figtree'; font-size: 12px; color: ${semantic.text?.fgSubtle ?? '#666'}; }
.numbers td:nth-child(2) { text-align: right; font-family: 'Figtree'; }
.radii-row { display: flex; gap: 12px; flex-wrap: wrap; }
.radius-card {
  width: 88px; height: 88px;
  background: ${semantic.bg?.subtle ?? '#f3f4f6'};
  border: 1px solid ${semantic.border?.base ?? '#e5e5e5'};
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 4px;
}
.radius-card span { font-family: 'Figtree'; font-weight: 500; font-size: 13px; }
.radius-card code { font-family: 'Figtree'; font-size: 11px; color: ${semantic.text?.fgSubtle ?? '#666'}; }
.spec { display: flex; flex-direction: column; gap: 8px; }
.spec-row { display: flex; align-items: baseline; gap: 24px; padding: 8px 0; border-bottom: 1px solid ${semantic.border?.subtle ?? '#f3f4f6'}; }
.spec-name { font-family: 'Figtree'; font-size: 11px; color: ${semantic.text?.fgSubtle ?? '#666'}; min-width: 180px; }
.spec-text { font-weight: 400; }
.components { display: grid; grid-template-columns: minmax(0, 1fr); gap: 24px; }
.card { background: ${semantic.bg?.panel ?? '#fff'}; border: 1px solid ${semantic.border?.base ?? '#e5e5e5'}; border-radius: 12px; padding: 24px; }
.eyebrow { margin: 0 0 8px; font-family: 'Figtree'; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: ${semantic.text?.fgSubtext ?? '#999'}; }
.card-title { margin: 0 0 8px; font-family: 'Source Serif 4'; font-weight: 600; font-size: 20px; }
.card-body { margin: 0; color: ${semantic.text?.fgSubtle ?? '#666'}; }
.btn { font-family: 'Open Sans'; font-weight: 500; font-size: 14px; padding: 8px 16px; border-radius: 8px; border: 1px solid transparent; cursor: pointer; }
.btn-primary { background: ${semantic.blue?.solid ?? '#4263EB'}; color: #fff; }
.btn-primary:hover { background: ${semantic.blue?.fg ?? '#2943C3'}; }
.btn-secondary { background: ${semantic.bg?.panel ?? '#fff'}; color: ${semantic.text?.fg ?? '#141413'}; border-color: ${semantic.border?.base ?? '#e5e5e5'}; }
.btn-secondary:hover { background: ${semantic.bg?.subtle ?? '#f3f4f6'}; }
.btn-ghost { background: transparent; color: ${semantic.text?.fgMuted ?? '#333'}; }
.btn-ghost:hover { background: ${semantic.bg?.subtle ?? '#f3f4f6'}; }
.status-row { display: flex; gap: 8px; flex-wrap: wrap; }
.badge { font-family: 'Figtree'; font-size: 12px; padding: 4px 10px; border-radius: 4px; }
.badge-info { background: ${semantic.bg?.info ?? '#F2F6FF'}; color: ${semantic.text?.fgInfo ?? '#2943C3'}; }
.badge-success { background: ${semantic.bg?.success ?? '#ecfdf5'}; color: ${semantic.text?.fgSuccess ?? '#047857'}; }
.badge-warning { background: ${semantic.bg?.warning ?? '#fff7ed'}; color: ${semantic.text?.fgWarning ?? '#b45309'}; }
.badge-error { background: ${semantic.bg?.error ?? '#fef2f2'}; color: ${semantic.text?.fgError ?? '#dc2626'}; }
.badge-neutral { background: ${semantic.bg?.subtle ?? '#f3f4f6'}; color: ${semantic.text?.fgSubtle ?? '#666'}; }
</style>
</head>
<body>
<div class="app">
  <header class="brand">
    <h1>Teacher Score · Design System</h1>
    <span class="sub">基于 Slidepilot V1 · 自动从 token.json 生成</span>
  </header>

  <nav class="toc">
    <a href="#semantic">语义化 tokens</a>
    <a href="#colors">颜色色阶</a>
    <a href="#type">字体</a>
    <a href="#sizing">间距与圆角</a>
    <a href="#components">组件样例</a>
  </nav>

  <h2 id="semantic" style="font-family:'Source Serif 4';font-weight:600;font-size:28px;margin:0 0 24px;border-bottom:1px solid ${semantic.border?.base};padding-bottom:12px">语义化 tokens — 业务代码里应该用这些</h2>
  ${['bg', 'text', 'border', 'blue', 'red', 'green', 'orange', 'yellow', 'purple', 'pink', 'cyan', 'teal'].map(semanticBlock).join('')}

  <h2 id="colors" style="font-family:'Source Serif 4';font-weight:600;font-size:28px;margin:64px 0 24px;border-bottom:1px solid ${semantic.border?.base};padding-bottom:12px">全局色阶</h2>
  ${['gray', 'blue', 'red', 'green', 'yellow', 'orange', 'purple', 'pink', 'cyan', 'teal'].map(scale).join('')}

  <h2 id="type" style="font-family:'Source Serif 4';font-weight:600;font-size:28px;margin:64px 0 24px;border-bottom:1px solid ${semantic.border?.base};padding-bottom:12px">字体</h2>
  ${typeSpecimen()}

  <h2 id="sizing" style="font-family:'Source Serif 4';font-weight:600;font-size:28px;margin:64px 0 24px;border-bottom:1px solid ${semantic.border?.base};padding-bottom:12px">间距 · 圆角 · 边框</h2>
  ${sizeBlock('spacing', 'Spacing')}
  ${radiiBlock()}
  ${sizeBlock('border widths', 'Borders')}

  <h2 id="components" style="font-family:'Source Serif 4';font-weight:600;font-size:28px;margin:64px 0 24px;border-bottom:1px solid ${semantic.border?.base};padding-bottom:12px">组件样例</h2>
  ${componentSamples()}

  <footer style="margin-top:80px;padding-top:24px;border-top:1px solid ${semantic.border?.base};font-family:'Figtree';font-size:12px;color:${semantic.text?.fgSubtext}">
    生成自 docs/claude/token.json · 修改 token.json 后运行 <code>pnpm tokens:build</code> 重新生成
  </footer>
</div>
</body>
</html>`;
}

function isDark(hex: string): boolean {
  const m = hex.match(/^#([0-9a-f]{6})/i);
  if (!m) {
    // try rgba
    const ma = hex.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!ma) return false;
    const [, r, g, b] = ma;
    return (Number(r) * 299 + Number(g) * 587 + Number(b) * 114) / 1000 < 128;
  }
  const c = m[1]!;
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 < 128;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
