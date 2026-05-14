/**
 * Semantic tokens —— 业务代码 / 组件 / 页面只应该用这一层。
 *
 * 两层意义：
 *  - 业务代码不关心"颜色是 blue.600 还是 indigo.500"，只关心"这是主操作背景"
 *  - 切换 theme（明暗 / 高对比）只改这一层的指向，其他代码零修改
 *
 * 命名约定：
 *  - bg.*   背景色（页面 / 卡片 / hover 态等）
 *  - fg.*   前景色（文本 / 图标）
 *  - border.* 边框
 *  - interactive.* 交互态（按钮、输入框）的成套色
 *  - status.* 状态色（info/success/warning/danger）的成套色
 */

import { colors, focusRing } from './base';

export interface SemanticPalette {
  bg: {
    canvas: string;          // 页面最底层
    surface: string;         // 卡片、面板（默认 surface）
    surfaceSubtle: string;   // 次级 surface（sidebar、table header）
    surfaceHover: string;    // surface 的 hover 态
    muted: string;           // 静默色块
    inverse: string;         // 反色背景（深底白字）
    overlay: string;         // 弹层遮罩

    brand: string;
    brandSubtle: string;
    brandMuted: string;
  };
  fg: {
    default: string;         // 主文本
    muted: string;           // 副文本
    subtle: string;          // 弱化文本（提示、placeholder）
    disabled: string;
    inverse: string;         // 反色文本（深底白字）
    onBrand: string;         // 在 brand 背景上的前景色（按钮文字）

    brand: string;           // brand 色的文本（如链接）
    link: string;
    linkHover: string;
  };
  border: {
    default: string;
    subtle: string;
    strong: string;
    focus: string;
    brand: string;
  };

  // 交互态：每个 variant 一组（bg / bgHover / bgActive / fg / border）
  interactive: {
    primary: InteractiveColors;
    secondary: InteractiveColors;
    ghost: InteractiveColors;
    danger: InteractiveColors;
  };

  // 状态色（成套）：bg(浅) / fg(深) / border / solid(纯色)
  status: {
    info: StatusColors;
    success: StatusColors;
    warning: StatusColors;
    danger: StatusColors;
    neutral: StatusColors;
  };

  // 色感效果（focus ring 等）—— theme 切换时跟随 brand
  effects: {
    focusRing: string;
    focusRingDanger: string;
  };
}

export interface InteractiveColors {
  bg: string;
  bgHover: string;
  bgActive: string;
  fg: string;
  border: string;
}

export interface StatusColors {
  bg: string;        // 浅色背景（badge / banner）
  fg: string;        // 深色文字（与 bg 配套）
  border: string;
  solid: string;     // 实色（icon / 进度条 / 按钮）
}

// ── Light theme ───────────────────────────────────────────────────────
export const light: SemanticPalette = {
  bg: {
    canvas: colors.gray[50],
    surface: colors.white,
    surfaceSubtle: colors.gray[50],
    surfaceHover: colors.gray[100],
    muted: colors.gray[100],
    inverse: colors.gray[900],
    overlay: colors.blackAlpha[500],

    brand: colors.blue[600],
    brandSubtle: colors.blue[50],
    brandMuted: colors.blue[100],
  },
  fg: {
    default: colors.gray[900],
    muted: colors.gray[700],
    subtle: colors.gray[500],
    disabled: colors.gray[400],
    inverse: colors.white,
    onBrand: colors.white,

    brand: colors.blue[700],
    link: colors.blue[600],
    linkHover: colors.blue[700],
  },
  border: {
    default: colors.gray[200],
    subtle: colors.gray[150],
    strong: colors.gray[300],
    focus: colors.blue[500],
    brand: colors.blue[600],
  },
  interactive: {
    primary: {
      bg: colors.blue[600],
      bgHover: colors.blue[700],
      bgActive: colors.blue[800],
      fg: colors.white,
      border: colors.blue[600],
    },
    secondary: {
      bg: colors.white,
      bgHover: colors.gray[50],
      bgActive: colors.gray[100],
      fg: colors.gray[900],
      border: colors.gray[300],
    },
    ghost: {
      bg: colors.transparent,
      bgHover: colors.gray[100],
      bgActive: colors.gray[200],
      fg: colors.gray[700],
      border: colors.transparent,
    },
    danger: {
      bg: colors.red[600],
      bgHover: colors.red[700],
      bgActive: colors.red[800],
      fg: colors.white,
      border: colors.red[600],
    },
  },
  status: {
    info: {
      bg: colors.blue[50],
      fg: colors.blue[700],
      border: colors.blue[200],
      solid: colors.blue[600],
    },
    success: {
      bg: colors.green[50],
      fg: colors.green[700],
      border: colors.green[200],
      solid: colors.green[600],
    },
    warning: {
      bg: colors.orange[50],
      fg: colors.orange[700],
      border: colors.orange[200],
      solid: colors.orange[600],
    },
    danger: {
      bg: colors.red[50],
      fg: colors.red[700],
      border: colors.red[200],
      solid: colors.red[600],
    },
    neutral: {
      bg: colors.gray[100],
      fg: colors.gray[700],
      border: colors.gray[200],
      solid: colors.gray[600],
    },
  },
  effects: {
    focusRing: focusRing(colors.blue[500]),
    focusRingDanger: focusRing(colors.red[600]),
  },
};

// ── Dark theme（占位，已经按相同 schema 给好默认值，待后续打磨）─────────
export const dark: SemanticPalette = {
  bg: {
    canvas: colors.gray[950],
    surface: colors.gray[900],
    surfaceSubtle: colors.gray[800],
    surfaceHover: colors.gray[800],
    muted: colors.gray[800],
    inverse: colors.gray[50],
    overlay: colors.blackAlpha[700],

    brand: colors.blue[500],
    brandSubtle: colors.blue[950],
    brandMuted: colors.blue[900],
  },
  fg: {
    default: colors.gray[50],
    muted: colors.gray[300],
    subtle: colors.gray[400],
    disabled: colors.gray[600],
    inverse: colors.gray[900],
    onBrand: colors.white,

    brand: colors.blue[300],
    link: colors.blue[400],
    linkHover: colors.blue[300],
  },
  border: {
    default: colors.gray[800],
    subtle: colors.gray[800],
    strong: colors.gray[700],
    focus: colors.blue[400],
    brand: colors.blue[500],
  },
  interactive: {
    primary: {
      bg: colors.blue[500],
      bgHover: colors.blue[400],
      bgActive: colors.blue[300],
      fg: colors.white,
      border: colors.blue[500],
    },
    secondary: {
      bg: colors.gray[900],
      bgHover: colors.gray[800],
      bgActive: colors.gray[700],
      fg: colors.gray[50],
      border: colors.gray[700],
    },
    ghost: {
      bg: colors.transparent,
      bgHover: colors.gray[800],
      bgActive: colors.gray[700],
      fg: colors.gray[300],
      border: colors.transparent,
    },
    danger: {
      bg: colors.red[500],
      bgHover: colors.red[600],
      bgActive: colors.red[700],
      fg: colors.white,
      border: colors.red[500],
    },
  },
  status: {
    info: { bg: colors.blue[950], fg: colors.blue[300], border: colors.blue[800], solid: colors.blue[500] },
    success: { bg: colors.green[950], fg: colors.green[200], border: colors.green[800], solid: colors.green[500] },
    warning: { bg: colors.orange[950], fg: colors.orange[200], border: colors.orange[800], solid: colors.orange[500] },
    danger: { bg: colors.red[950], fg: colors.red[200], border: colors.red[800], solid: colors.red[500] },
    neutral: { bg: colors.gray[800], fg: colors.gray[300], border: colors.gray[700], solid: colors.gray[500] },
  },
  effects: {
    focusRing: focusRing(colors.blue[400], 0.3),
    focusRingDanger: focusRing(colors.red[500], 0.3),
  },
};

export const themes = { light, dark } as const;
export type ThemeName = keyof typeof themes;
