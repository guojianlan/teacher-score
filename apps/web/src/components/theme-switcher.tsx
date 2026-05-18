'use client';

/**
 * ThemeSwitcher —— 根据 data-theme 属性切换 CSS 变量。
 * 业务代码 0 修改：所有颜色已经引用 var(--xxx)，theme 一变 CSS 重排即可。
 *
 * 持久化到 localStorage，下次访问自动恢复。
 * "跟随系统" 模式下移除 data-theme，由 prefers-color-scheme 决定。
 */

import { useEffect, useState } from 'react';
import { Select } from '@/components/ui';

export type ThemeChoice = 'auto' | 'light' | 'dark' | 'sepia';

export const THEME_STORAGE_KEY = 'teacher-score-theme';

const LABELS: Record<ThemeChoice, string> = {
  auto: '跟随系统',
  light: '浅色 · Light',
  dark: '深色 · Dark',
  sepia: '米色 · Sepia',
};

// auto 模式下根据 OS 偏好解析为具体值。
// 关键：data-theme 属性必须永远存在（含 'light'），否则 Chakra v3 的 _dark 条件
// 在内置组件（Drawer / Table / Menu）里不激活，会导致它们用 light 默认色但我们的
// 业务 token 走 OS-dark 路径，文字 / 背景错配（白底浅字看不见）。
function resolveTheme(choice: ThemeChoice): 'light' | 'dark' | 'sepia' {
  if (choice !== 'auto') return choice;
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia?.('(prefers-color-scheme: dark)')?.matches ? 'dark' : 'light';
}

function applyTheme(choice: ThemeChoice) {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', resolveTheme(choice));
}

function readStored(): ThemeChoice {
  if (typeof window === 'undefined') return 'auto';
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY) as ThemeChoice | null;
    if (v && ['auto', 'light', 'dark', 'sepia'].includes(v)) return v;
  } catch {
    // localStorage may be blocked
  }
  return 'auto';
}

export function useTheme(): [ThemeChoice, (t: ThemeChoice) => void] {
  const [theme, setThemeState] = useState<ThemeChoice>('auto');

  // 首次渲染后从 localStorage 读
  useEffect(() => {
    const stored = readStored();
    setThemeState(stored);
    applyTheme(stored); // 保险：init 脚本可能未跑（仅 storage 有值时跑）
  }, []);

  // auto 模式下监听 OS 主题变化，自动重应用
  useEffect(() => {
    if (theme !== 'auto' || typeof window === 'undefined') return;
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mq) return;
    const handler = () => applyTheme('auto');
    mq.addEventListener?.('change', handler);
    return () => mq.removeEventListener?.('change', handler);
  }, [theme]);

  const setTheme = (t: ThemeChoice) => {
    setThemeState(t);
    applyTheme(t);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, t);
    } catch {
      // 忽略
    }
  };

  return [theme, setTheme];
}

export function ThemeSwitcher({ size = 'sm' }: { size?: 'xs' | 'sm' | 'md' }) {
  const [theme, setTheme] = useTheme();
  return (
    <Select
      size={size}
      value={theme}
      onChange={(e) => setTheme(e.target.value as ThemeChoice)}
      aria-label="切换主题"
    >
      {(Object.keys(LABELS) as ThemeChoice[]).map((t) => (
        <option key={t} value={t}>
          {LABELS[t]}
        </option>
      ))}
    </Select>
  );
}

/**
 * 内联脚本：在 React hydrate 之前同步设置 data-theme，避免 flash-of-wrong-theme。
 * 在 layout.tsx 的 <head> 里用 <script dangerouslySetInnerHTML={{__html: themeInitScript}}/>
 */
export const themeInitScript = `
(function() {
  try {
    var t = localStorage.getItem('${THEME_STORAGE_KEY}');
    var resolved = 'light';
    if (t === 'light' || t === 'dark' || t === 'sepia') {
      resolved = t;
    } else {
      // auto / 未设置：跟随 OS
      resolved = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', resolved);
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'light');
  }
})();
`.trim();
