'use client';

import { CacheProvider } from '@chakra-ui/next-js';
import { ChakraProvider, extendTheme, type ThemeConfig } from '@chakra-ui/react';

// 全部颜色 / 字号 / 间距值来自 Slidepilot V1 (docs/claude/token.json)。
// CSS 变量见 apps/web/src/styles/tokens.css（自动生成）。

const config: ThemeConfig = { initialColorMode: 'light', useSystemColorMode: false };

const theme = extendTheme({
  config,
  fonts: {
    heading: "var(--font-display-loaded), 'Open Sans', system-ui, sans-serif",
    body: "var(--font-body-loaded), 'Open Sans', system-ui, sans-serif",
    mono: "var(--font-mono-loaded), 'Figtree', ui-monospace, monospace",
    serif: "var(--font-serif-loaded), 'Source Serif 4', Georgia, serif",
  },
  fontSizes: {
    '2xs': '10px', xs: '12px', sm: '14px', md: '16px', lg: '18px',
    xl: '20px', '2xl': '24px', '3xl': '30px', '4xl': '36px', '5xl': '48px', '6xl': '60px', '7xl': '72px',
  },
  radii: { none: '0', xs: '2px', sm: '4px', md: '6px', lg: '8px', xl: '10px', '2xl': '12px', '3xl': '16px', '4xl': '24px', full: '9999px' },
  colors: {
    gray: {
      50: '#fafafa', 100: '#f3f4f6', 150: '#ebebeb', 200: '#e5e5e5', 300: '#d8d8d8',
      400: '#bfbfbf', 500: '#999999', 600: '#808080', 700: '#666666', 800: '#4d4d4d',
      900: '#333333', 950: '#191922', 960: '#141413',
    },
    blue: {
      30: '#F7F9FF', 50: '#F2F6FF', 100: '#E8F0FF', 200: '#C5D7FB', 300: '#A3BCF7',
      400: '#81A0F3', 500: '#6182EF', 600: '#4263EB', 700: '#2943C3', 800: '#16289C', 900: '#081374',
    },
    yellow: {
      20: '#F7F6F2', 50: '#fffbe8', 100: '#fff4c8', 200: '#ffeba8', 300: '#ffdf87',
      400: '#ffd470', 500: '#ffc247', 600: '#d2952c', 700: '#a66d17', 800: '#835b0b',
    },
    red: { 50: '#fef2f2', 100: '#fee2e2', 200: '#fecaca', 600: '#dc2626', 700: '#b91c1c' },
    green: { 50: '#E8FFEA', 100: '#d1fae5', 600: '#16a34a', 700: '#15803d' },
    orange: { 50: '#FFF7E8', 600: '#ea580c', 700: '#c2410c' },
    brand: {
      50: '#F2F6FF', 100: '#E8F0FF', 200: '#C5D7FB', 300: '#A3BCF7', 400: '#81A0F3',
      500: '#6182EF', 600: '#4263EB', 700: '#2943C3', 800: '#16289C', 900: '#081374',
    },
  },
  semanticTokens: {
    colors: {
      'bg.page': '#F7F6F2',
      'bg.panel': '#ffffff',
      'bg.subtle': 'gray.100',
      'bg.muted': '#e8e9eb',
      'bg.emphasized': 'gray.300',
      'bg.inverted': '#141413',
      'bg.info': '#F2F6FF',
      'bg.success': '#E8FFEA',
      'bg.warning': '#FFF7E8',
      'bg.error': '#fef2f2',
      'text.fg': '#141413',
      'text.fgMuted': '#333333',
      'text.fgSubtle': '#666666',
      'text.fgSubtext': '#999999',
      'text.fgInverted': '#ffffff',
      'text.fgInfo': 'blue.700',
      'text.fgSuccess': 'green.700',
      'text.fgWarning': 'orange.700',
      'text.fgError': 'red.700',
      'border.base': 'gray.200',
      'border.subtle': 'gray.100',
      'border.muted': 'gray.150',
      'border.emphasized': 'gray.300',
      'border.hover': 'gray.400',
    },
  },
  styles: {
    global: {
      'html, body': {
        bg: 'bg.page',
        color: 'text.fg',
        textRendering: 'optimizeLegibility',
        WebkitFontSmoothing: 'antialiased',
        MozOsxFontSmoothing: 'grayscale',
      },
      '::selection': { bg: 'blue.100', color: 'blue.700' },
    },
  },
  components: {
    Heading: {
      baseStyle: { fontFamily: 'heading', fontWeight: 600, color: 'text.fg', letterSpacing: '-0.01em' },
      sizes: {
        '2xl': { fontSize: ['32px', '40px'], lineHeight: 1.15, fontWeight: 600 },
        xl: { fontSize: ['26px', '30px'], lineHeight: 1.2, fontWeight: 600 },
        lg: { fontSize: '22px', lineHeight: 1.25, fontWeight: 600 },
        md: { fontSize: '18px', lineHeight: 1.35, fontWeight: 600 },
        sm: { fontSize: '15px', lineHeight: 1.4, fontWeight: 600 },
      },
    },
    Button: {
      baseStyle: { fontFamily: 'body', fontWeight: 500, borderRadius: 'lg' },
      sizes: {
        sm: { h: '32px', px: '12px', fontSize: 'sm' },
        md: { h: '40px', px: '16px', fontSize: 'md' },
        lg: { h: '44px', px: '20px', fontSize: 'md' },
      },
      variants: {
        solid: {
          bg: 'brand.600', color: 'white',
          _hover: { bg: 'brand.700', _disabled: { bg: 'brand.600' } },
          _active: { bg: 'brand.800' },
        },
        outline: {
          border: '1px solid', borderColor: 'border.base', color: 'text.fg', bg: 'bg.panel',
          _hover: { bg: 'bg.subtle', borderColor: 'border.hover' },
        },
        ghost: {
          color: 'text.fgMuted', bg: 'transparent',
          _hover: { bg: 'bg.subtle' },
        },
        link: { color: 'brand.600', _hover: { color: 'brand.700', textDecoration: 'underline' } },
      },
      defaultProps: { variant: 'solid' },
    },
    Input: {
      sizes: { md: { field: { h: '40px', px: '12px', fontSize: 'md', borderRadius: 'lg' } } },
      variants: {
        outline: {
          field: {
            border: '1px solid', borderColor: 'border.base', bg: 'bg.panel',
            _hover: { borderColor: 'border.hover' },
            _focus: { borderColor: 'brand.500', boxShadow: '0 0 0 3px rgba(66,99,235,0.18)' },
          },
        },
      },
      defaultProps: { variant: 'outline' },
    },
    Textarea: {
      variants: {
        outline: {
          border: '1px solid', borderColor: 'border.base', bg: 'bg.panel', borderRadius: 'lg',
          _hover: { borderColor: 'border.hover' },
          _focus: { borderColor: 'brand.500', boxShadow: '0 0 0 3px rgba(66,99,235,0.18)' },
        },
      },
    },
    Select: {
      variants: {
        outline: {
          field: {
            border: '1px solid', borderColor: 'border.base', bg: 'bg.panel', borderRadius: 'lg',
            _hover: { borderColor: 'border.hover' },
            _focus: { borderColor: 'brand.500', boxShadow: '0 0 0 3px rgba(66,99,235,0.18)' },
          },
        },
      },
    },
    Badge: {
      baseStyle: {
        textTransform: 'none', fontWeight: 500, borderRadius: 'sm', px: 2, py: '3px', fontSize: 'xs',
      },
    },
    Table: {
      baseStyle: {
        th: {
          fontFamily: 'mono', fontSize: 'xs', letterSpacing: '0.06em',
          textTransform: 'uppercase', color: 'text.fgSubtext', fontWeight: 500, borderColor: 'border.base',
        },
        td: { borderColor: 'border.subtle', color: 'text.fgMuted', fontSize: 'md' },
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
