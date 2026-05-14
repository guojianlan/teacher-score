'use client';

/**
 * ThemeToggle —— sidebar 用的紧凑切换器，点击循环切换：
 *   auto → light → dark → sepia → auto
 */
import { Box, Tooltip } from '@chakra-ui/react';
import { useTheme, type ThemeChoice } from './theme-switcher';

const ORDER: ThemeChoice[] = ['auto', 'light', 'dark', 'sepia'];

const ICONS: Record<ThemeChoice, string> = {
  auto: '⏾',
  light: '☀',
  dark: '☾',
  sepia: '◐',
};

const LABELS: Record<ThemeChoice, string> = {
  auto: '跟随系统',
  light: '浅色',
  dark: '深色',
  sepia: '米色',
};

export function ThemeToggle() {
  const [theme, setTheme] = useTheme();
  const next = () => {
    const i = ORDER.indexOf(theme);
    setTheme(ORDER[(i + 1) % ORDER.length]!);
  };
  return (
    <Tooltip label={`当前: ${LABELS[theme]} · 点击切换`} placement="right" hasArrow openDelay={300}>
      <Box
        as="button"
        onClick={next}
        w="28px"
        h="28px"
        display="inline-flex"
        alignItems="center"
        justifyContent="center"
        borderRadius="md"
        fontSize="md"
        color="fg.muted"
        _hover={{ bg: 'bg.surfaceHover', color: 'fg.default' }}
        transition="all 120ms ease"
        aria-label={`切换主题（当前 ${LABELS[theme]}）`}
      >
        {ICONS[theme]}
      </Box>
    </Tooltip>
  );
}
