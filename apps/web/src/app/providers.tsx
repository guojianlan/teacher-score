'use client';

import { CacheProvider } from '@chakra-ui/next-js';
import { ChakraProvider, extendTheme, type ThemeConfig } from '@chakra-ui/react';
import {
  colors, fonts, fontSizes, fontWeights, lineHeights, letterSpacings,
  space, radii, borderWidths, shadows, durations,
  light, dark, effects, textStyles,
} from '@/styles/tokens';

// Chakra 的 semanticTokens 支持 _light / _dark 字段，原生支持主题切换。
// 把 semantic/light + semantic/dark 灌进去：bg/fg/border/interactive/status 进 colors,
// effects（focusRing 等）进 shadows。

const config: ThemeConfig = { initialColorMode: 'light', useSystemColorMode: false };

function flatten(p: Record<string, unknown>, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(p)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      Object.assign(out, flatten(v as Record<string, unknown>, key));
    } else {
      out[key] = String(v);
    }
  }
  return out;
}

// 颜色类 token：bg / fg / border / interactive / status
const lightColorsFlat = flatten(light as unknown as Record<string, unknown>);
const darkColorsFlat = flatten(dark as unknown as Record<string, unknown>);
const semanticColors: Record<string, { default: string; _dark: string }> = {};
for (const k of Object.keys(lightColorsFlat)) {
  semanticColors[k] = { default: lightColorsFlat[k]!, _dark: darkColorsFlat[k] ?? lightColorsFlat[k]! };
}

// 效果类 token（box-shadow 字符串）—— effects.light / effects.dark
const lightEffects = effects.light;
const darkEffects = effects.dark;
const semanticShadows: Record<string, { default: string; _dark: string }> = {};
for (const k of Object.keys(lightEffects)) {
  semanticShadows[k] = {
    default: lightEffects[k as keyof typeof lightEffects],
    _dark: (darkEffects as Record<string, string>)[k] ?? lightEffects[k as keyof typeof lightEffects],
  };
}

const theme = extendTheme({
  config,
  fonts: {
    body: fonts.sans,
    heading: fonts.sans,
    mono: fonts.mono,
    serif: fonts.serif,
    display: fonts.display,
  },
  fontSizes,
  fontWeights,
  lineHeights,
  letterSpacings,
  space,
  radii,
  borders: borderWidths,
  shadows,
  transition: {
    duration: durations,
  },
  // Base token 色阶 —— 给 semantic 引用，业务代码请优先使用 semantic
  colors,
  // 语义化 —— 业务代码请用这些（bg.canvas / fg.default / interactive.primary.bg / ...）
  semanticTokens: {
    colors: semanticColors,
    shadows: semanticShadows,
  },
  // 命名组合样式 —— 业务代码用 `<Text textStyle="body.md" />`
  textStyles,

  styles: {
    global: {
      'html, body': {
        bg: 'bg.canvas',
        color: 'fg.default',
        textRendering: 'optimizeLegibility',
        WebkitFontSmoothing: 'antialiased',
        MozOsxFontSmoothing: 'grayscale',
      },
      '::selection': { bg: 'bg.brandSubtle', color: 'fg.brand' },
    },
  },

  components: {
    Heading: {
      baseStyle: { fontFamily: 'heading', fontWeight: 'semibold', color: 'fg.default', letterSpacing: 'tight' },
      sizes: {
        '2xl': { fontSize: ['4xl', '5xl'], lineHeight: 'tight' },
        xl: { fontSize: ['3xl', '4xl'], lineHeight: 'snug' },
        lg: { fontSize: '3xl', lineHeight: 'snug' },
        md: { fontSize: '2xl', lineHeight: 'snug' },
        sm: { fontSize: 'xl', lineHeight: 'snug' },
      },
    },
    Button: {
      baseStyle: { fontFamily: 'body', fontWeight: 'medium', borderRadius: 'lg' },
      sizes: {
        sm: { h: '32px', px: 3, fontSize: 'sm' },
        md: { h: '40px', px: 4, fontSize: 'md' },
        lg: { h: '44px', px: 5, fontSize: 'md' },
      },
      variants: {
        solid: {
          bg: 'interactive.primary.bg', color: 'interactive.primary.fg',
          _hover: { bg: 'interactive.primary.bgHover', _disabled: { bg: 'interactive.primary.bg' } },
          _active: { bg: 'interactive.primary.bgActive' },
        },
        outline: {
          bg: 'interactive.secondary.bg',
          color: 'interactive.secondary.fg',
          border: '1px solid',
          borderColor: 'interactive.secondary.border',
          _hover: { bg: 'interactive.secondary.bgHover' },
          _active: { bg: 'interactive.secondary.bgActive' },
        },
        ghost: {
          bg: 'interactive.ghost.bg', color: 'interactive.ghost.fg',
          _hover: { bg: 'interactive.ghost.bgHover' },
          _active: { bg: 'interactive.ghost.bgActive' },
        },
        danger: {
          bg: 'interactive.danger.bg', color: 'interactive.danger.fg',
          _hover: { bg: 'interactive.danger.bgHover' },
          _active: { bg: 'interactive.danger.bgActive' },
        },
        link: { color: 'fg.link', _hover: { color: 'fg.linkHover', textDecoration: 'underline' } },
      },
      defaultProps: { variant: 'solid' },
    },
    Input: {
      sizes: { md: { field: { h: '40px', px: 3, fontSize: 'md', borderRadius: 'lg' } } },
      variants: {
        outline: {
          field: {
            border: '1px solid', borderColor: 'border.default', bg: 'bg.surface',
            _hover: { borderColor: 'border.strong' },
            _focusVisible: { borderColor: 'border.focus', boxShadow: 'focusRing' },
          },
        },
      },
      defaultProps: { variant: 'outline' },
    },
    Textarea: {
      variants: {
        outline: {
          border: '1px solid', borderColor: 'border.default', bg: 'bg.surface', borderRadius: 'lg',
          _hover: { borderColor: 'border.strong' },
          _focusVisible: { borderColor: 'border.focus', boxShadow: 'focusRing' },
        },
      },
    },
    Select: {
      variants: {
        outline: {
          field: {
            border: '1px solid', borderColor: 'border.default', bg: 'bg.surface', borderRadius: 'lg',
            _hover: { borderColor: 'border.strong' },
            _focusVisible: { borderColor: 'border.focus', boxShadow: 'focusRing' },
          },
        },
      },
    },
    Badge: {
      baseStyle: { textTransform: 'none', fontWeight: 'medium', borderRadius: 'sm', px: 2, py: '3px', fontSize: 'xs' },
    },
    Table: {
      baseStyle: {
        th: {
          fontFamily: 'mono', fontSize: 'xs', letterSpacing: 'wider',
          textTransform: 'uppercase', color: 'fg.subtle', fontWeight: 'semibold',
          borderColor: 'border.default',
        },
        td: { borderColor: 'border.subtle', color: 'fg.default', fontSize: 'md' },
      },
    },
  },
});

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <CacheProvider>
      <ChakraProvider theme={theme}>{children}</ChakraProvider>
    </CacheProvider>
  );
}
