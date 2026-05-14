'use client';

import { CacheProvider } from '@chakra-ui/next-js';
import { ChakraProvider, extendTheme, type ThemeConfig } from '@chakra-ui/react';

// 视觉气质：Notion / iA Writer 教研笔记风。
// - 纯白底（不是 gray.50 那种"网页感"）
// - 衬线字体为主（Newsreader 可变字体，opsz 轴标题正文同源）
// - 配色克制：墨黑为主，#0969DA 蓝只用在 hover/active/链接
// - 阴影几乎不用，靠 hairline 边界分隔
// - 圆角小（6px），不要那种 SaaS 圆角胶囊感

const config: ThemeConfig = { initialColorMode: 'light', useSystemColorMode: false };

const theme = extendTheme({
  config,
  fonts: {
    heading: 'var(--font-display), "Songti SC", "STSong", Georgia, serif',
    body: 'var(--font-display), "Songti SC", "STSong", Georgia, serif',
    mono: 'var(--font-mono), "SF Mono", Menlo, Consolas, monospace',
  },
  fontSizes: {
    xs: '12px',
    sm: '13px',
    md: '15px',
    lg: '17px',
    xl: '20px',
    '2xl': '24px',
    '3xl': '30px',
    '4xl': '38px',
    '5xl': '48px',
    '6xl': '60px',
  },
  // GitHub 配色族（Notion 也是从这套来的）
  colors: {
    ink: {
      900: '#1F2328',   // 主文本
      700: '#424A53',
      500: '#656D76',   // muted
      300: '#8C959F',
      100: '#D0D7DE',   // hairline
    },
    paper: {
      50: '#FFFFFF',
      100: '#F6F8FA',   // sidebar / 次级背景
      200: '#EFF2F5',
      300: '#E1E7EC',
    },
    accent: {
      50: '#DDF4FF',
      100: '#B6E3FF',
      200: '#80CCFF',
      300: '#54AEFF',
      400: '#218BFF',
      500: '#0969DA',   // 主蓝
      600: '#0550AE',
      700: '#033D8B',
      800: '#0A3069',
      900: '#002155',
    },
    success: { 500: '#1A7F37', 100: '#DAFBE1' },
    danger: { 500: '#CF222E', 100: '#FFEBE9' },
    warn: { 500: '#9A6700', 100: '#FFF8C5' },
    // 覆盖 Chakra 默认的 brand 别名
    brand: {
      50: '#DDF4FF',
      100: '#B6E3FF',
      200: '#80CCFF',
      300: '#54AEFF',
      400: '#218BFF',
      500: '#0969DA',
      600: '#0550AE',
      700: '#033D8B',
      800: '#0A3069',
      900: '#002155',
    },
  },
  styles: {
    global: {
      'html, body': {
        bg: 'paper.50',
        color: 'ink.900',
        fontFeatureSettings: '"ss01", "ss02", "cv01", "cv11"',
        textRendering: 'optimizeLegibility',
        WebkitFontSmoothing: 'antialiased',
        MozOsxFontSmoothing: 'grayscale',
      },
      // selection 用淡蓝
      '::selection': { bg: 'accent.100', color: 'accent.800' },
    },
  },
  components: {
    Heading: {
      baseStyle: {
        fontFamily: 'heading',
        fontWeight: 500,         // serif 不要太粗，500 已经够重
        letterSpacing: '-0.01em',
        color: 'ink.900',
      },
      sizes: {
        '2xl': { fontSize: ['38px', '46px'], fontWeight: 500, lineHeight: 1.15 },
        xl: { fontSize: '30px', fontWeight: 500, lineHeight: 1.2 },
        lg: { fontSize: '24px', fontWeight: 500, lineHeight: 1.25 },
        md: { fontSize: '18px', fontWeight: 600, lineHeight: 1.35 },
        sm: { fontSize: '15px', fontWeight: 600, lineHeight: 1.4 },
      },
    },
    Button: {
      baseStyle: {
        fontFamily: 'body',
        fontWeight: 500,
        borderRadius: '6px',
      },
      variants: {
        solid: {
          bg: 'ink.900',
          color: 'paper.50',
          _hover: { bg: 'ink.700', _disabled: { bg: 'ink.900' } },
          _active: { bg: 'ink.900' },
        },
        outline: {
          border: '1px solid',
          borderColor: 'ink.100',
          color: 'ink.900',
          bg: 'transparent',
          _hover: { bg: 'paper.100', borderColor: 'ink.300' },
        },
        ghost: {
          color: 'ink.700',
          _hover: { bg: 'paper.100' },
        },
        link: {
          color: 'accent.500',
          textDecoration: 'underline',
          textUnderlineOffset: '3px',
          _hover: { color: 'accent.700' },
        },
      },
      defaultProps: { colorScheme: undefined, variant: 'solid' },
    },
    Input: {
      variants: {
        outline: {
          field: {
            border: '1px solid',
            borderColor: 'ink.100',
            borderRadius: '6px',
            bg: 'paper.50',
            fontSize: 'md',
            _hover: { borderColor: 'ink.300' },
            _focus: { borderColor: 'accent.500', boxShadow: '0 0 0 3px rgba(9,105,218,0.15)' },
          },
        },
      },
      defaultProps: { variant: 'outline' },
    },
    Textarea: {
      variants: {
        outline: {
          border: '1px solid',
          borderColor: 'ink.100',
          borderRadius: '6px',
          bg: 'paper.50',
          _hover: { borderColor: 'ink.300' },
          _focus: { borderColor: 'accent.500', boxShadow: '0 0 0 3px rgba(9,105,218,0.15)' },
        },
      },
    },
    Select: {
      variants: {
        outline: {
          field: {
            border: '1px solid',
            borderColor: 'ink.100',
            borderRadius: '6px',
            bg: 'paper.50',
            _hover: { borderColor: 'ink.300' },
            _focus: { borderColor: 'accent.500', boxShadow: '0 0 0 3px rgba(9,105,218,0.15)' },
          },
        },
      },
    },
    Badge: {
      baseStyle: {
        textTransform: 'none',
        fontWeight: 500,
        borderRadius: '4px',
        px: 2,
        py: '2px',
        fontSize: 'xs',
      },
    },
    Table: {
      baseStyle: {
        th: {
          fontFamily: 'mono',
          fontSize: 'xs',
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          color: 'ink.500',
          fontWeight: 500,
          borderColor: 'ink.100',
        },
        td: { borderColor: 'ink.100' },
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
