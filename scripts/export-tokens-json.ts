#!/usr/bin/env tsx
/**
 * scripts/export-tokens-json.ts
 *
 * 一次性工具：把 __generated.ts 当前的值导出为 DTCG 格式的 token.json。
 *
 * 用途：迁移 / 紧急修复 / 验证 round-trip 完整性。
 * 正常工作流的源头是 token.json，不是 TS。
 *
 *   pnpm tokens:export-json
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  colors, fonts, fontSizes, fontWeights, lineHeights, letterSpacings,
  space, radii, borderWidths, shadows, durations, easings, motion,
  light, dark, effects, textStyles,
} from '../apps/web/src/styles/tokens';

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs/claude/token.json');

type Dtcg = { $type: string; $value: unknown; $description?: string };

const dtcg = (type: string, value: unknown, description?: string): Dtcg =>
  description ? { $type: type, $value: value, $description: description } : { $type: type, $value: value };

const SCALE_HINTS: Record<string, string> = {
  '50': 'app 底色 / 卡片底',
  '100': 'UI 元素背景',
  '200': '弱边线',
  '300': '边线 emphasized',
  '400': 'disabled fg / placeholder',
  '500': '低对比文本',
  '600': '主操作 solid (按钮底)',
  '700': '主操作 hover',
  '800': '主操作 active',
  '900': '高对比文本',
  '950': '反色背景 / 最深',
};

function colorScale(scale: Record<string, string>, family: string): Record<string, Dtcg> {
  const out: Record<string, Dtcg> = {};
  for (const [k, v] of Object.entries(scale)) {
    const hint = SCALE_HINTS[k];
    out[k] = dtcg('color', v, hint ? `${family}.${k} · ${hint}` : `${family}.${k}`);
  }
  return out;
}

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

function buildColorLookup(): Map<string, string> {
  const map = new Map<string, string>();
  const families = ['gray', 'blue', 'green', 'red', 'orange', 'yellow', 'blackAlpha', 'whiteAlpha'] as const;
  for (const f of families) {
    const scale = (colors as Record<string, unknown>)[f];
    if (typeof scale === 'object' && scale !== null) {
      for (const [k, v] of Object.entries(scale as Record<string, string>)) {
        if (!map.has(v)) map.set(v, `{core.color.${f}.${k}}`);
      }
    }
  }
  map.set(colors.white, '{core.color.white}');
  map.set(colors.black, '{core.color.black}');
  map.set(colors.transparent, '{core.color.transparent}');
  return map;
}
const colorRefMap = buildColorLookup();
const refOf = (v: string) => colorRefMap.get(v) ?? v;

function themeColorsToDtcg(
  palette: Record<string, unknown>,
  themeName: string,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [group, items] of Object.entries(palette)) {
    const groupOut: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(items as Record<string, unknown>)) {
      if (typeof v === 'string') {
        groupOut[k] = dtcg('color', refOf(v), `${themeName} · ${group}.${k}`);
      } else if (v && typeof v === 'object') {
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

function effectsToDtcg(themeEffects: Record<string, string>, themeName: string) {
  const out: Record<string, Dtcg> = {};
  const descs: Record<string, string> = {
    focusRing: 'focus 状态的 3px 环 (输入框、按钮)',
    focusRingDanger: '危险态 focus 环 (删除按钮、错误输入框)',
  };
  for (const [k, v] of Object.entries(themeEffects)) {
    out[k] = dtcg('shadow', v, `${themeName} · ${descs[k] ?? `effect.${k}`}`);
  }
  return out;
}

function textStylesToDtcg() {
  const core = [
    'display', 'pageTitle', 'sectionTitle', 'cardTitle',
    'bodyLg', 'body', 'bodySm', 'label', 'mono', 'overline',
  ];
  const out: Record<string, Dtcg> = {};
  for (const name of core) {
    const s = (textStyles as Record<string, unknown>)[name] as
      | { fontFamily: string; fontSize: string; fontWeight: number; lineHeight: number; letterSpacing?: string; textTransform?: string }
      | undefined;
    if (!s) continue;
    out[name] = dtcg(
      'typography',
      {
        fontFamily: s.fontFamily.startsWith('var(')
          ? `{core.fontFamily.${guessFamilyKey(s.fontFamily)}}`
          : s.fontFamily,
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

async function main() {
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

  // 每个 theme 是顶层 set，含 bg/fg/border/interactive/status/effect
  const lightTheme = {
    ...themeColorsToDtcg(light as unknown as Record<string, unknown>, 'light'),
    effect: effectsToDtcg(effects.light as Record<string, string>, 'light'),
  };
  const darkTheme = {
    ...themeColorsToDtcg(dark as unknown as Record<string, unknown>, 'dark'),
    effect: effectsToDtcg(effects.dark as Record<string, string>, 'dark'),
  };

  const motionDtcg: Record<string, Dtcg> = {};
  for (const [name, preset] of Object.entries(motion)) {
    motionDtcg[name] = dtcg(
      'transition',
      { duration: preset.duration, timingFunction: preset.timingFunction },
      `motion.${name} · ${motionDescription(name)}`,
    );
  }

  const json: Record<string, unknown> = {
    $schema: 'https://design-tokens.github.io/community-group/format/',
    core,
    light: lightTheme,
    dark: darkTheme,
    motion: motionDtcg,
    textStyle: textStylesToDtcg(),

    $themes: [
      {
        id: 'light',
        name: 'Light',
        selectedTokenSets: { core: 'source', light: 'enabled', motion: 'source', textStyle: 'source' },
      },
      {
        id: 'dark',
        name: 'Dark',
        selectedTokenSets: { core: 'source', dark: 'enabled', motion: 'source', textStyle: 'source' },
      },
    ],
    $metadata: {
      tokenSetOrder: ['core', 'light', 'dark', 'motion', 'textStyle'],
      version: '1.0.0',
      generator: 'scripts/export-tokens-json.ts',
      generatedAt: new Date().toISOString(),
    },
  };

  await fs.writeFile(OUT, JSON.stringify(json, null, 2));
  console.log(`✓ ${path.relative(ROOT, OUT)}`);
  console.log(`  core (原料):  ${Object.keys(core.color).length} 色族 + 11 其他类型`);
  console.log(`  light / dark: theme sets (含 bg/fg/border/interactive/status/effect)`);
  console.log(`  motion:       ${Object.keys(motion).length} intents`);
  console.log(`  textStyle:    10 命名样式`);
  console.log(`  $themes:      ${(json.$themes as unknown[]).length} 个`);
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
