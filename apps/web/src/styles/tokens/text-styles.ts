/**
 * Text styles —— 业务代码用 `<Text textStyle="body">`。
 *
 * 设计原则（避免膨胀）：
 *   1. 命名按"角色"而非"大小"：用 `pageTitle` 不用 `text32`
 *   2. < 12 个；新增前确认全站已有 ≥ 3 处同款用法
 *   3. 不要做"变体维度"（粗细 / 斜体）——这些用 chakra props 在调用处加：
 *      `<Text textStyle="body" fontStyle="italic">`
 *   4. mono / overline 是稀有但常见的"标识性"样式，保留
 */

import { fonts, fontSizes, fontWeights, lineHeights, letterSpacings } from './base';

interface TextStyle {
  fontFamily: string;
  fontSize: string;
  fontWeight: number;
  lineHeight: number;
  letterSpacing?: string;
  textTransform?: 'uppercase' | 'lowercase' | 'capitalize' | 'none';
}

// ─── 10 核心 textStyles ────────────────────────────────────────────────
export const textStyles: Record<string, TextStyle> = {
  /** Hero / 落地页主标题（每个产品只用 1-2 次） */
  display: {
    fontFamily: fonts.display,
    fontSize: fontSizes['7xl'],
    fontWeight: fontWeights.semibold,
    lineHeight: lineHeights.tight,
    letterSpacing: letterSpacings.tighter,
  },
  /** 页面主标题 · <h1> */
  pageTitle: {
    fontFamily: fonts.sans,
    fontSize: fontSizes['4xl'],
    fontWeight: fontWeights.semibold,
    lineHeight: lineHeights.snug,
    letterSpacing: letterSpacings.tight,
  },
  /** 章节标题 · <h2> */
  sectionTitle: {
    fontFamily: fonts.sans,
    fontSize: fontSizes['2xl'],
    fontWeight: fontWeights.semibold,
    lineHeight: lineHeights.snug,
  },
  /** 卡片 / 块标题 · <h3> */
  cardTitle: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.semibold,
    lineHeight: lineHeights.snug,
  },
  /** 重要正文 / 介绍段 */
  bodyLg: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.regular,
    lineHeight: lineHeights.relaxed,
  },
  /** 默认正文 */
  body: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.regular,
    lineHeight: lineHeights.base,
  },
  /** 副文本 / meta / 时间戳 */
  bodySm: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.regular,
    lineHeight: lineHeights.base,
  },
  /** 按钮文字 / form label / 表头 */
  label: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
    lineHeight: lineHeights.snug,
  },
  /** 数字 / ID / 代码 inline */
  mono: {
    fontFamily: fonts.mono,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.regular,
    lineHeight: lineHeights.snug,
  },
  /** 大写小字 · eyebrow / overline / section badge */
  overline: {
    fontFamily: fonts.mono,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.semibold,
    lineHeight: lineHeights.snug,
    letterSpacing: letterSpacings.widest,
    textTransform: 'uppercase',
  },
};

// ─── Aliases ────────────────────────────────────────────────────────────
// 老代码兼容，下次重构清掉。新代码不要写这些。
const aliases: Record<string, keyof typeof textStyles> = {
  'display.2xl': 'display',
  'display.xl': 'display',
  'display.lg': 'display',
  'display.md': 'display',
  'heading.xl': 'pageTitle',
  'heading.lg': 'sectionTitle',
  'heading.md': 'sectionTitle',
  'heading.sm': 'cardTitle',
  'heading.xs': 'cardTitle',
  'title.serif.lg': 'sectionTitle',
  'title.serif.md': 'cardTitle',
  'body.lg': 'bodyLg',
  'body.md': 'body',
  'body.sm': 'bodySm',
  'body.xs': 'bodySm',
  'label.lg': 'label',
  'label.md': 'label',
  'label.sm': 'label',
  'mono.md': 'mono',
  'mono.sm': 'mono',
  'mono.xs': 'mono',
  caption: 'bodySm',
};
for (const [alias, target] of Object.entries(aliases)) {
  textStyles[alias] = textStyles[target]!;
}

/* ── 新增 textStyle 的规则 ─────────────────────────────────────────────
 * 1. 出现 3+ 个组件用同一组合 → 该建 token
 * 2. 命名按 role：
 *      ✓ quote / tableHeader / formError
 *      ✗ text14 / small / bodyMedium
 * 3. 不拆变体维度（细体、斜体、大小）—— 用 chakra props 在调用处加：
 *      <Text textStyle="body" fontWeight="medium">
 * 4. 新增前去 design-system.html 看一眼，多数场景"现有 textStyle + 一个 prop"就够
 * ─────────────────────────────────────────────────────────────────── */
