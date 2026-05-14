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

function applyTheme(theme: ThemeChoice) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (theme === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
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
    setThemeState(readStored());
  }, []);

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
    if (t && t !== 'auto' && (t === 'light' || t === 'dark' || t === 'sepia')) {
      document.documentElement.setAttribute('data-theme', t);
    }
  } catch (e) {}
})();
`.trim();
