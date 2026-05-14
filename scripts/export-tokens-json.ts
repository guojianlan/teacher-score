#!/usr/bin/env tsx
/**
 * scripts/export-tokens-json.ts
 *
 * 把当前的 TS token 源文件（base.ts / semantic.ts / text-styles.ts）
 * 一次性导出为 DTCG 兼容的 docs/claude/token.json。
 *
 * 设计目标：
 *   - 输出格式严格遵循 W3C DTCG（含 $type / $value / $description）
 *   - semantic 层用 `{core.color.gray.50}` 引用语法，让 Tokens Studio 能
 *     在 Figma 里展示"语义引用关系"，而不是看到一堆 hex
 *   - 顶层结构同时是 Tokens Studio 的"token sets"：core / semantic / textStyle / motion / effects
 *   - 加上 $themes 数组与 $metadata，Figma 插件直接能 load
 *
 * 跑一次：
 *   pnpm exec tsx scripts/export-tokens-json.ts
 *
 * 此脚本是一次性迁移工具。**JSON 一旦生成，JSON 就是源**；后续修改请改 JSON，
 * 然后跑 `pnpm tokens:sync` 重新生成 TS。
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  colors, fonts, fontSizes, fontWeights, lineHeights, letterSpacings,
  space, radii, borderWidths, shadows, durations, easings, motion,
  light, dark, textStyles,
} from '../apps/web/src/styles/tokens';

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs/claude/token.json');
const BACKUP = path.join(ROOT, 'docs/claude/token.slidepilot-reference.json');

// ─── helpers ─────────────────────────────────────────────────────────
type Dtcg = { $type: string; $value: unknown; $description?: string };

const dtcg = (type: string, value: unknown, description?: string): Dtcg =>
  description ? { $type: type, $value: value, $description: description } : { $type: type, $value: value };

// 把一个色阶对象 ({50: '#xx', 100: '#yy'}) 转成 DTCG 色阶
function colorScale(scale: Record<string, string>, family: string): Record<string, Dtcg> {
  const out: Record<string, Dtcg> = {};
  const semanticHints: Record<string, string> = {
    '50': 'app 底色 / 卡片底',
    '100': 'UI 元素背景',
    '200': '弱边线',
    '300': '边线 emphasized',
    '400': 'disabled fg / placeholder',
    '500': '低对比文本',
    '600': '主操作 solid（按钮底）',
    '700': '主操作 hover',
    '800': '主操作 active',
    '900': '高对比文本',
    '950': '反色背景 / 最深',
  };
  for (const [k, v] of Object.entries(scale)) {
    const hint = semanticHints[k];
    out[k] = dtcg('color', v, hint ? `${family}.${k} · ${hint}` : `${family}.${k}`);
  }
  return out;
}

// 把"任意嵌套对象"转成 DTCG 树，叶子节点（string）自动 wrap
function leavesTo(type: string, obj: Record<string, unknown>, descPrefix = ''): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = leavesTo(type, v as Record<string, unknown>, descPrefix ? `${descPrefix}.${k}` : k);
    } else {
      const desc = descPrefix ? `${descPrefix}.${k}` : k;
      out[k] = dtcg(type, v, desc);
    }
  }
  return out;
}

// hex/字符串值 → 反查 core 引用路径；找不到则原样
function buildColorLookup(): Map<string, string> {
  const map = new Map<string, string>();
  // 注意：第一个写入获胜（避免别名互相覆盖）
  const families = ['gray', 'blue', 'green', 'red', 'orange', 'yellow', 'blackAlpha', 'whiteAlpha'] as const;
  for (const f of families) {
    const scale = (colors as Record<string, unknown>)[f];
    if (typeof scale === 'object' && scale !== null) {
      for (const [k, v] of Object.entries(scale as Record<string, string>)) {
        if (!map.has(v)) map.set(v, `{core.color.${f}.${k}}`);
      }
    }
  }
  // 单值
  map.set(colors.white, '{core.color.white}');
  map.set(colors.black, '{core.color.black}');
  map.set(colors.transparent, '{core.color.transparent}');
  return map;
}
const colorRefMap = buildColorLookup();
const refOf = (v: string) => colorRefMap.get(v) ?? v;

// 把 semantic 调色板转成 DTCG（值替换为 {core.color.xx} 引用）
function semanticToDtcg(palette: typeof light, themeName: string) {
  const out: Record<string, unknown> = {};
  for (const [group, items] of Object.entries(palette)) {
    if (group === 'effects') continue; // effects 单独处理（shadow 字符串）
    const groupOut: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(items as Record<string, unknown>)) {
      if (typeof v === 'string') {
        groupOut[k] = dtcg('color', refOf(v), `${themeName} · ${group}.${k}`);
      } else if (v && typeof v === 'object') {
        // 子组（如 interactive.primary.bg）
        const sub: Record<string, unknown> = {};
        for (const [sk, sv] of Object.entries(v as Record<string, string>)) {
          sub[sk] = dtcg('color', refOf(sv), `${themeName} · ${group}.${k}.${sk}`);
        }
        groupOut[k] = sub;
      }
    }
    out[group] = groupOut;
  }
  return out;
}

// effects 用 shadow type；focusRing 在现代 CSS 下是字符串
function effectsToDtcg(palette: typeof light, themeName: string) {
  return {
    focusRing: dtcg(
      'shadow',
      palette.effects.focusRing,
      `${themeName} · focus 状态下输入框/按钮的 3px 环色，跟随 border.focus 自动重映射`,
    ),
    focusRingDanger: dtcg(
      'shadow',
      palette.effects.focusRingDanger,
      `${themeName} · 危险态 focus 环（删除按钮、错误输入框）`,
    ),
  };
}

// textStyles 用 typography composite type（DTCG 标准）
function textStylesToDtcg() {
  // 只导出 alias 之外的 10 核心（aliases 在运行时再展开）
  const core = [
    'display', 'pageTitle', 'sectionTitle', 'cardTitle',
    'bodyLg', 'body', 'bodySm', 'label', 'mono', 'overline',
  ];
  const out: Record<string, Dtcg> = {};
  for (const name of core) {
    const s = textStyles[name];
    if (!s) continue;
    out[name] = dtcg(
      'typography',
      {
        fontFamily: s.fontFamily.startsWith('var(') ? s.fontFamily : `{core.fontFamily.${guessFamilyKey(s.fontFamily)}}`,
        fontSize: s.fontSize,
        fontWeight: s.fontWeight,
        lineHeight: s.lineHeight,
        letterSpacing: s.letterSpacing ?? '0',
        textTransform: s.textTransform ?? 'none',
      },
      `textStyle.${name}`,
    );
  }
  return out;
}

function guessFamilyKey(stack: string): string {
  if (stack.includes('--font-display')) return 'display';
  if (stack.includes('--font-serif')) return 'serif';
  if (stack.includes('--font-mono')) return 'mono';
  return 'sans';
}

// ─── build ───────────────────────────────────────────────────────────
async function main() {
  // 备份旧 token.json
  try {
    await fs.access(OUT);
    const oldContent = await fs.readFile(OUT, 'utf8');
    const oldJson = JSON.parse(oldContent);
    // 只在看起来是 Slidepilot 版（含 'Slidepilot V1' 顶层 key）时备份
    if ('Slidepilot V1' in oldJson || 'Slidepilot V0' in oldJson) {
      await fs.writeFile(BACKUP, oldContent);
      console.log(`✓ 备份旧 Slidepilot JSON → ${path.relative(ROOT, BACKUP)}`);
    }
  } catch {
    // 旧文件不存在
  }

  const core = {
    color: {
      gray: colorScale(colors.gray, 'gray'),
      blue: colorScale(colors.blue, 'blue'),
      green: colorScale(colors.green, 'green'),
      red: colorScale(colors.red, 'red'),
      orange: colorScale(colors.orange, 'orange'),
      yellow: colorScale(colors.yellow, 'yellow'),
      blackAlpha: colorScale(colors.blackAlpha as Record<string, string>, 'blackAlpha'),
      whiteAlpha: colorScale(colors.whiteAlpha as Record<string, string>, 'whiteAlpha'),
      white: dtcg('color', colors.white, '纯白'),
      black: dtcg('color', colors.black, '纯黑'),
      transparent: dtcg('color', colors.transparent, '透明'),
    },
    fontFamily: {
      sans: dtcg('fontFamily', fonts.sans, '默认无衬线 · Open Sans'),
      display: dtcg('fontFamily', fonts.display, '展示字体 · Poppins · hero 标题用'),
      serif: dtcg('fontFamily', fonts.serif, '衬线 · Source Serif 4 · 装饰性场景'),
      mono: dtcg('fontFamily', fonts.mono, '等宽 · JetBrains Mono · 数字/ID/代码'),
    },
    fontSize: leavesTo('dimension', fontSizes as unknown as Record<string, unknown>),
    fontWeight: leavesTo('fontWeight', fontWeights as unknown as Record<string, unknown>),
    lineHeight: leavesTo('number', lineHeights as unknown as Record<string, unknown>),
    letterSpacing: leavesTo('dimension', letterSpacings as unknown as Record<string, unknown>),
    space: leavesTo('dimension', space as unknown as Record<string, unknown>),
    radius: leavesTo('dimension', radii as unknown as Record<string, unknown>),
    borderWidth: leavesTo('dimension', borderWidths as unknown as Record<string, unknown>),
    shadow: leavesTo('shadow', shadows as unknown as Record<string, unknown>),
    duration: leavesTo('duration', durations as unknown as Record<string, unknown>),
    easing: leavesTo('cubicBezier', easings as unknown as Record<string, unknown>),
  };

  const motionDtcg: Record<string, Dtcg> = {};
  for (const [name, preset] of Object.entries(motion)) {
    motionDtcg[name] = dtcg(
      'transition',
      { duration: preset.duration, timingFunction: preset.easing },
      `motion.${name} · ${motionDescription(name)}`,
    );
  }

  const json = {
    $schema: 'https://design-tokens.github.io/community-group/format/',
    core,
    'semantic/light': semanticToDtcg(light, 'light'),
    'semantic/dark': semanticToDtcg(dark, 'dark'),
    'effects/light': effectsToDtcg(light, 'light'),
    'effects/dark': effectsToDtcg(dark, 'dark'),
    motion: motionDtcg,
    textStyle: textStylesToDtcg(),

    $themes: [
      {
        id: 'light',
        name: 'Light',
        selectedTokenSets: {
          core: 'source',
          'semantic/light': 'enabled',
          'effects/light': 'enabled',
          motion: 'source',
          textStyle: 'source',
        },
      },
      {
        id: 'dark',
        name: 'Dark',
        selectedTokenSets: {
          core: 'source',
          'semantic/dark': 'enabled',
          'effects/dark': 'enabled',
          motion: 'source',
          textStyle: 'source',
        },
      },
    ],
    $metadata: {
      tokenSetOrder: [
        'core',
        'semantic/light', 'semantic/dark',
        'effects/light', 'effects/dark',
        'motion',
        'textStyle',
      ],
      version: '1.0.0',
      generator: 'scripts/export-tokens-json.ts',
      generatedAt: new Date().toISOString(),
    },
  };

  await fs.writeFile(OUT, JSON.stringify(json, null, 2));
  console.log(`✓ 生成 DTCG JSON → ${path.relative(ROOT, OUT)}`);
  console.log(`  - core: ${Object.keys(core.color).length} color families + 9 其他类型`);
  console.log(`  - semantic: light + dark`);
  console.log(`  - effects: light + dark`);
  console.log(`  - motion: ${Object.keys(motion).length} intents`);
  console.log(`  - textStyle: 10 核心`);
  console.log(`  - $themes: Light + Dark （可直接喂给 Tokens Studio）`);
}

function motionDescription(name: string): string {
  const desc: Record<string, string> = {
    subtle: 'hover/active/focus 微交互, 120ms',
    enter: '元素进入视图（弹窗/toast）, 200ms',
    exit: '元素离开, 140ms',
    emphasize: '强调态, 320ms + spring',
    page: '页面级转场, 240ms',
  };
  return desc[name] ?? '';
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
