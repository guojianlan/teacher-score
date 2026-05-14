'use client';

import { ChakraProvider, createSystem, defaultConfig, defineConfig } from '@chakra-ui/react';
import {
  colors, fonts, fontSizes, fontWeights, lineHeights, letterSpacings,
  space, radii, borderWidths, shadows, durations,
  light, dark, effects, textStyles,
} from '@/styles/tokens';

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

function wrapSemantic(
  lightObj: Record<string, unknown>,
  darkObj: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(lightObj)) {
    const lv = lightObj[k];
    const dv = (darkObj as Record<string, unknown>)[k];
    if (lv && typeof lv === 'object' && !Array.isArray(lv)) {
      out[k] = wrapSemantic(lv as Record<string, unknown>, (dv ?? {}) as Record<string, unknown>);
    } else {
      out[k] = { value: { base: lv, _dark: dv ?? lv } };
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
  colors: wrapSemantic(
    light as unknown as Record<string, unknown>,
    dark as unknown as Record<string, unknown>,
  ),
  shadows: {
    focusRing: {
      value: { base: effects.light.focusRing, _dark: effects.dark.focusRing },
    },
    focusRingDanger: {
      value: { base: effects.light.focusRingDanger, _dark: effects.dark.focusRingDanger },
    },
  },
};

const config = defineConfig({
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
    '::selection': { bg: 'brand.subtle', color: 'brand.fg' },
  },
});

const system = createSystem(defaultConfig, config);

export function Providers({ children }: { children: React.ReactNode }) {
  return <ChakraProvider value={system}>{children}</ChakraProvider>;
}
