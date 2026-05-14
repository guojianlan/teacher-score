/**
 * Base tokens — primitives only.
 * 业务代码不要直接用这一层。给 semantic 层引用用。
 * 改 baseToken 等于改了"原料"，全站会跟着变。
 */

export const colors = {
  // 中性色阶 —— 温暖偏暖一点，比纯灰活泼
  gray: {
    50: '#FAFAF9',
    100: '#F5F5F4',
    150: '#EFEEEC',
    200: '#E7E5E4',
    300: '#D6D3D1',
    400: '#A8A29E',
    500: '#78716C',
    600: '#57534E',
    700: '#44403C',
    800: '#292524',
    900: '#1C1917',
    950: '#0C0A09',
  },

  // 品牌色 —— 清新但饱和度高的靛蓝
  blue: {
    50: '#EFF4FF',
    100: '#DBE7FE',
    200: '#BFD3FE',
    300: '#93B4FD',
    400: '#608AFA',
    500: '#3D66F5',
    600: '#2849E8',
    700: '#2138D4',
    800: '#2030AB',
    900: '#1F2D87',
    950: '#171E50',
  },

  // 状态色
  green: {
    50: '#F0FDF4',
    100: '#DCFCE7',
    200: '#BBF7D0',
    500: '#22C55E',
    600: '#16A34A',
    700: '#15803D',
    800: '#166534',
  },
  red: {
    50: '#FEF2F2',
    100: '#FEE2E2',
    200: '#FECACA',
    500: '#EF4444',
    600: '#DC2626',
    700: '#B91C1C',
    800: '#991B1B',
  },
  orange: {
    50: '#FFF7ED',
    100: '#FFEDD5',
    200: '#FED7AA',
    500: '#F97316',
    600: '#EA580C',
    700: '#C2410C',
    800: '#9A3412',
  },
  yellow: {
    50: '#FEFCE8',
    100: '#FEF9C3',
    200: '#FEF08A',
    500: '#EAB308',
    600: '#CA8A04',
    700: '#A16207',
  },

  // 通用
  white: '#FFFFFF',
  black: '#000000',
  transparent: 'transparent',

  // 微透明黑白（叠加用，比普通灰色更"会消失"）
  blackAlpha: {
    50: 'rgba(0,0,0,0.04)',
    100: 'rgba(0,0,0,0.06)',
    200: 'rgba(0,0,0,0.08)',
    300: 'rgba(0,0,0,0.16)',
    400: 'rgba(0,0,0,0.24)',
    500: 'rgba(0,0,0,0.36)',
    600: 'rgba(0,0,0,0.48)',
    700: 'rgba(0,0,0,0.64)',
    800: 'rgba(0,0,0,0.80)',
  },
  whiteAlpha: {
    50: 'rgba(255,255,255,0.04)',
    100: 'rgba(255,255,255,0.06)',
    200: 'rgba(255,255,255,0.08)',
    300: 'rgba(255,255,255,0.16)',
    400: 'rgba(255,255,255,0.24)',
    500: 'rgba(255,255,255,0.36)',
    600: 'rgba(255,255,255,0.48)',
    700: 'rgba(255,255,255,0.64)',
    800: 'rgba(255,255,255,0.80)',
  },
} as const;

// 字体栈 —— 通过 next/font 注入的 CSS 变量
export const fonts = {
  sans: "var(--font-body-loaded), 'Open Sans', system-ui, -apple-system, 'Segoe UI', 'PingFang SC', sans-serif",
  display: "var(--font-display-loaded), 'Poppins', system-ui, sans-serif",
  serif: "var(--font-serif-loaded), 'Source Serif 4', Georgia, serif",
  mono: "var(--font-mono-loaded), 'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace",
} as const;

export const fontSizes = {
  '2xs': '10px',
  xs: '12px',
  sm: '13px',
  md: '14px',
  lg: '16px',
  xl: '18px',
  '2xl': '20px',
  '3xl': '24px',
  '4xl': '30px',
  '5xl': '36px',
  '6xl': '48px',
  '7xl': '60px',
  '8xl': '72px',
} as const;

export const fontWeights = {
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
} as const;

export const lineHeights = {
  none: 1,
  tight: 1.15,
  snug: 1.3,
  base: 1.5,
  relaxed: 1.65,
  loose: 1.85,
} as const;

export const letterSpacings = {
  tighter: '-0.04em',
  tight: '-0.02em',
  normal: '0',
  wide: '0.02em',
  wider: '0.05em',
  widest: '0.12em',
} as const;

// 4px 网格
export const space = {
  '0': '0',
  '0.5': '2px',
  '1': '4px',
  '1.5': '6px',
  '2': '8px',
  '2.5': '10px',
  '3': '12px',
  '3.5': '14px',
  '4': '16px',
  '5': '20px',
  '6': '24px',
  '7': '28px',
  '8': '32px',
  '9': '36px',
  '10': '40px',
  '12': '48px',
  '14': '56px',
  '16': '64px',
  '20': '80px',
  '24': '96px',
  '28': '112px',
  '32': '128px',
  '40': '160px',
  '48': '192px',
  '56': '224px',
  '64': '256px',
  '80': '320px',
  '96': '384px',
} as const;

export const radii = {
  none: '0',
  xs: '2px',
  sm: '4px',
  md: '6px',
  lg: '8px',
  xl: '12px',
  '2xl': '16px',
  '3xl': '24px',
  full: '9999px',
} as const;

export const borderWidths = {
  '0': '0',
  hairline: '0.5px',
  sm: '1px',
  md: '2px',
  lg: '4px',
} as const;

// 阴影 —— 谨慎使用（设计偏 flat，多数地方用 border 而不是 shadow）
export const shadows = {
  xs: '0 1px 2px rgba(28,25,23,0.04)',
  sm: '0 1px 3px rgba(28,25,23,0.06), 0 1px 2px rgba(28,25,23,0.04)',
  md: '0 4px 8px -2px rgba(28,25,23,0.08), 0 2px 4px -2px rgba(28,25,23,0.04)',
  lg: '0 12px 24px -6px rgba(28,25,23,0.10), 0 4px 8px -4px rgba(28,25,23,0.04)',
  xl: '0 24px 48px -12px rgba(28,25,23,0.14)',
  focus: '0 0 0 3px rgba(61,102,245,0.20)',
  focusDanger: '0 0 0 3px rgba(220,38,38,0.20)',
} as const;

export const durations = {
  instant: '0ms',
  fast: '120ms',
  base: '200ms',
  slow: '400ms',
} as const;

export const easings = {
  out: 'cubic-bezier(0.16, 1, 0.3, 1)', // expo-out — modern, snappy
  inOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
} as const;

export const zIndex = {
  base: 0,
  dropdown: 100,
  sticky: 200,
  overlay: 300,
  modal: 400,
  toast: 500,
} as const;

export type ColorScale = typeof colors.gray;
export type ColorFamilies = keyof typeof colors;
