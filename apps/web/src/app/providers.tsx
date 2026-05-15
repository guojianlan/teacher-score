'use client';

import { ChakraProvider, createSystem, defaultConfig, defineConfig } from '@chakra-ui/react';
import {
  colors, fonts, fontSizes, fontWeights, lineHeights, letterSpacings,
  space, radii, borderWidths, shadows, durations,
  light, textStyles,
} from '@/styles/tokens';
import '@/styles/tokens.css';

// 把 string 包成 v3 的 { value } 形式
const v = (value: string | number): { value: string | number } => ({ value });

function wrap(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(obj)) {
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      out[k] = wrap(val as Record<string, unknown>);
    } else {
      out[k] = v(val as string | number);
    }
  }
  return out;
}

// 同步 sync.ts 的 CSS 变量命名约定：a.b.c → --a-b-c (全小写)
function cssVarName(parts: string[]): string {
  return '--' + parts.join('-').toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
}

/**
 * 把 light theme 的结构镜像成 semanticTokens，所有叶子节点指向 var(--xxx)。
 * 这样 Chakra 拿到的就是 CSS 变量引用，运行时由 data-theme + tokens.css 决定颜色。
 * 三主题（light/dark/sepia）切换完全由 [data-theme] 选择器驱动，不依赖 Chakra 的 _dark。
 */
function toVarRefs(
  node: Record<string, unknown>,
  pathParts: string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(node)) {
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      out[k] = toVarRefs(val as Record<string, unknown>, [...pathParts, k]);
    } else {
      out[k] = { value: `var(${cssVarName([...pathParts, k])})` };
    }
  }
  return out;
}

// Chakra v3 `colorPalette="primary"` 解析 `colors.primary.solid`，不是 `colors.palette.primary.solid`。
// 所以这里把 themes.light.palette.* 提升到顶层，与 bg/fg/border 平级。
// palette 子树在 CSS 里没有 'palette' 前缀路径段（cssVar 用的是 ['palette', name, key]），
// 所以提升到顶层时需要保持 CSS var 名带 `palette` 前缀。
function buildSemanticColors(lightTheme: Record<string, unknown>): Record<string, unknown> {
  const { palette, ...rest } = lightTheme as {
    palette?: Record<string, Record<string, unknown>>;
  } & Record<string, unknown>;

  // bg/fg/border/interactive/status 等：直接镜像，路径不含 palette
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(rest)) {
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      out[k] = toVarRefs(val as Record<string, unknown>, [k]);
    }
  }

  // palette.<name>.<key> → 顶层 <name>.<key>，但 CSS var 路径仍带 palette 前缀
  if (palette) {
    for (const [paletteName, paletteKeys] of Object.entries(palette)) {
      out[paletteName] = toVarRefs(
        paletteKeys as Record<string, unknown>,
        ['palette', paletteName],
      );
    }
    // 给 Chakra v3 内置 fallback "gray" 加别名，指向 neutral
    // （未声明 colorPalette 的 Button 默认走 gray，否则颜色解析为空 → 渲染异常）
    if (palette.neutral) {
      out.gray = toVarRefs(
        palette.neutral as Record<string, unknown>,
        ['palette', 'neutral'],
      );
    }
  }
  return out;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tokens: any = {
  colors: wrap(colors as unknown as Record<string, unknown>),
  fonts: {
    body: v(fonts.sans),
    heading: v(fonts.sans),
    mono: v(fonts.mono),
    serif: v(fonts.serif),
    display: v(fonts.display),
  },
  fontSizes: wrap(fontSizes as unknown as Record<string, unknown>),
  fontWeights: wrap(fontWeights as unknown as Record<string, unknown>),
  lineHeights: wrap(lineHeights as unknown as Record<string, unknown>),
  letterSpacings: wrap(letterSpacings as unknown as Record<string, unknown>),
  spacing: wrap(space as unknown as Record<string, unknown>),
  radii: wrap(radii as unknown as Record<string, unknown>),
  borders: wrap(borderWidths as unknown as Record<string, unknown>),
  shadows: wrap(shadows as unknown as Record<string, unknown>),
  durations: wrap(durations as unknown as Record<string, unknown>),
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const semanticTokens: any = {
  colors: buildSemanticColors(light as unknown as Record<string, unknown>),
  shadows: {
    // effect.focusRing 已在 tokens.css 里按主题切换
    focusRing:       { value: 'var(--effect-focusring)' },
    focusRingDanger: { value: 'var(--effect-focusringdanger)' },
  },
};

const config = defineConfig({
  // Chakra v3 内置的 dark condition 是 ".dark &"，但我们走 data-theme 属性。
  // 不接进来 → Chakra 内部组件（Table/Input/Menu）的 _dark 变体永远不激活，
  // 硬编码的 light bg 会在 dark 主题下漏出（白底表格、白底输入框…）。
  // 注意：只覆盖 dark；light 默认是 ":root &"（总是 fallback），不能动。
  conditions: {
    dark:  "[data-theme='dark'] &, .dark &",
    sepia: "[data-theme='sepia'] &",
  },
  theme: {
    tokens,
    semanticTokens,
    textStyles: Object.fromEntries(
      Object.entries(textStyles).map(([name, style]) => [name, { value: style }]),
    ),
  },
  globalCss: {
    'html, body': {
      bg: 'bg.canvas',
      color: 'fg.default',
      textRendering: 'optimizeLegibility',
    },
    '::selection': { bg: 'primary.subtle', color: 'primary.fg' },
  },
});

const system = createSystem(defaultConfig, config);

export function Providers({ children }: { children: React.ReactNode }) {
  return <ChakraProvider value={system}>{children}</ChakraProvider>;
}
