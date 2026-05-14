/**
 * Text styles —— 组合好的命名样式，JSX 里直接 textStyle="display.lg"。
 * 改一处全站统一。
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

export const textStyles: Record<string, TextStyle> = {
  // 大标题（hero / 落地页）—— display 字体
  'display.2xl': {
    fontFamily: fonts.display,
    fontSize: fontSizes['8xl'],
    fontWeight: fontWeights.semibold,
    lineHeight: lineHeights.tight,
    letterSpacing: letterSpacings.tighter,
  },
  'display.xl': {
    fontFamily: fonts.display,
    fontSize: fontSizes['7xl'],
    fontWeight: fontWeights.semibold,
    lineHeight: lineHeights.tight,
    letterSpacing: letterSpacings.tighter,
  },
  'display.lg': {
    fontFamily: fonts.display,
    fontSize: fontSizes['6xl'],
    fontWeight: fontWeights.semibold,
    lineHeight: lineHeights.tight,
    letterSpacing: letterSpacings.tight,
  },
  'display.md': {
    fontFamily: fonts.display,
    fontSize: fontSizes['5xl'],
    fontWeight: fontWeights.semibold,
    lineHeight: lineHeights.snug,
    letterSpacing: letterSpacings.tight,
  },

  // 节标题（页面 H1 / 卡片标题）—— sans 字体
  'heading.xl': {
    fontFamily: fonts.sans,
    fontSize: fontSizes['4xl'],
    fontWeight: fontWeights.semibold,
    lineHeight: lineHeights.snug,
    letterSpacing: letterSpacings.tight,
  },
  'heading.lg': {
    fontFamily: fonts.sans,
    fontSize: fontSizes['3xl'],
    fontWeight: fontWeights.semibold,
    lineHeight: lineHeights.snug,
  },
  'heading.md': {
    fontFamily: fonts.sans,
    fontSize: fontSizes['2xl'],
    fontWeight: fontWeights.semibold,
    lineHeight: lineHeights.snug,
  },
  'heading.sm': {
    fontFamily: fonts.sans,
    fontSize: fontSizes.xl,
    fontWeight: fontWeights.semibold,
    lineHeight: lineHeights.snug,
  },
  'heading.xs': {
    fontFamily: fonts.sans,
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.semibold,
    lineHeight: lineHeights.snug,
  },

  // 衬线标题变体 —— 用于装饰性场景（如 PageHeader 副标题、报告封面）
  'title.serif.lg': {
    fontFamily: fonts.serif,
    fontSize: fontSizes['3xl'],
    fontWeight: fontWeights.semibold,
    lineHeight: lineHeights.snug,
    letterSpacing: letterSpacings.tight,
  },
  'title.serif.md': {
    fontFamily: fonts.serif,
    fontSize: fontSizes['2xl'],
    fontWeight: fontWeights.semibold,
    lineHeight: lineHeights.snug,
  },

  // 正文（默认 body.md = 14px）
  'body.lg': {
    fontFamily: fonts.sans,
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.regular,
    lineHeight: lineHeights.relaxed,
  },
  'body.md': {
    fontFamily: fonts.sans,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.regular,
    lineHeight: lineHeights.base,
  },
  'body.sm': {
    fontFamily: fonts.sans,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.regular,
    lineHeight: lineHeights.base,
  },
  'body.xs': {
    fontFamily: fonts.sans,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.regular,
    lineHeight: lineHeights.base,
  },

  // 标签（按钮、表单 label、徽章）—— medium weight
  'label.lg': {
    fontFamily: fonts.sans,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.medium,
    lineHeight: lineHeights.snug,
  },
  'label.md': {
    fontFamily: fonts.sans,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
    lineHeight: lineHeights.snug,
  },
  'label.sm': {
    fontFamily: fonts.sans,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.medium,
    lineHeight: lineHeights.snug,
  },

  // 等宽（数字、ID、代码）
  'mono.md': {
    fontFamily: fonts.mono,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.regular,
    lineHeight: lineHeights.snug,
  },
  'mono.sm': {
    fontFamily: fonts.mono,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.regular,
    lineHeight: lineHeights.snug,
  },
  'mono.xs': {
    fontFamily: fonts.mono,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.regular,
    lineHeight: lineHeights.snug,
    letterSpacing: letterSpacings.wide,
  },

  // 大写小字 —— eyebrow / overline / section label
  overline: {
    fontFamily: fonts.mono,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.semibold,
    lineHeight: lineHeights.snug,
    letterSpacing: letterSpacings.widest,
    textTransform: 'uppercase',
  },
  caption: {
    fontFamily: fonts.sans,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.regular,
    lineHeight: lineHeights.snug,
  },
};
