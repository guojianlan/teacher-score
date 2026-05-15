'use client';

/**
 * /design-lab —— 用真实 Chakra v3 组件渲染当前 token 系统下所有 palette。
 *
 * 对应工具链：
 *   - 调色：打开 docs/claude/design-lab.html（OKLCH + WCAG）
 *   - 落库：保存导出的 token.json → 跑 pnpm tokens:sync
 *   - 验证：来这个页面看真实组件渲染结果
 */

import { useState } from 'react';
import {
  Box, Flex, Heading, Text, Stack, HStack, Button, Badge, Separator,
} from '@chakra-ui/react';
import { Alert, Tag } from '@/components/ui';
import { ThemeSwitcher } from '@/components/theme-switcher';
import Link from 'next/link';

const PALETTES = ['primary', 'neutral', 'success', 'warning', 'danger'] as const;
type Palette = typeof PALETTES[number];

const KEYS = ['solid', 'contrast', 'fg', 'subtle', 'muted', 'emphasized', 'border', 'focusRing'] as const;

export default function DesignLabPage() {
  const [selected, setSelected] = useState<Palette>('primary');

  return (
    <Box minH="100vh" bg="bg.canvas" color="fg.default" p={8}>
      <Stack gap={6} maxW="1200px" mx="auto">
        <Flex justify="space-between" align="center" flexWrap="wrap" gap={4}>
          <Box>
            <Heading size="lg">Design Lab</Heading>
            <Text color="fg.subtle" fontSize="sm" mt={1}>
              当前 token 系统 · 真实 Chakra v3 组件渲染
            </Text>
          </Box>
          <HStack gap={3}>
            <Box minW="180px"><ThemeSwitcher size="sm" /></Box>
            <Button asChild colorPalette="primary" variant="solid" size="sm">
              <a href="/design-lab.html" target="_blank" rel="noopener noreferrer">
                打开调色 Lab ↗
              </a>
            </Button>
          </HStack>
        </Flex>

        <Alert status="info">
          <Box>
            <Text fontWeight={600} fontSize="sm">工作流</Text>
            <Text fontSize="sm" mt={1}>
              1. 点 <code>打开调色 Lab</code> 跳到 <code>design-lab.html</code> 调色 →
              2. 导出 token.json 替换 <code>docs/claude/token.json</code> →
              3. 跑 <code>pnpm tokens:sync</code> →
              4. 刷新此页验证 →
              5. 跑 <code>pnpm tokens:audit</code> 看 WCAG。
            </Text>
          </Box>
        </Alert>

        {/* Palette 选择器 */}
        <Box>
          <Text fontSize="xs" color="fg.subtle" textTransform="uppercase" letterSpacing="0.08em" mb={2}>
            选择 palette
          </Text>
          <HStack gap={2} flexWrap="wrap">
            {PALETTES.map((p) => (
              <Button
                key={p}
                size="sm"
                variant={selected === p ? 'solid' : 'outline'}
                colorPalette={p}
                onClick={() => setSelected(p)}
              >
                {p}
              </Button>
            ))}
          </HStack>
        </Box>

        <Separator />

        {/* 当前选中 palette 的 8 键预览 */}
        <Section title={`${selected} · 8 键值`}>
          <Box display="grid" gridTemplateColumns="repeat(auto-fill, minmax(140px, 1fr))" gap={3}>
            {KEYS.map((key) => (
              <Box key={key} borderWidth="1px" borderColor="border.default" borderRadius="md" overflow="hidden">
                <Box
                  height="60px"
                  bg={`${selected}.${key}` as any}
                  borderBottomWidth="1px"
                  borderColor="border.default"
                />
                <Box p={2}>
                  <Text fontSize="xs" fontFamily="mono" fontWeight={600}>{key}</Text>
                  <Text fontSize="2xs" fontFamily="mono" color="fg.subtle">
                    {selected}.{key}
                  </Text>
                </Box>
              </Box>
            ))}
          </Box>
        </Section>

        {/* Button 5 variants */}
        <Section title={`${selected} · Button variants`}>
          <HStack gap={3} flexWrap="wrap">
            <Button colorPalette={selected} variant="solid">Solid</Button>
            <Button colorPalette={selected} variant="outline">Outline</Button>
            <Button colorPalette={selected} variant="ghost">Ghost</Button>
            <Button colorPalette={selected} variant="subtle">Subtle</Button>
            <Button colorPalette={selected} variant="surface">Surface</Button>
          </HStack>
        </Section>

        {/* Button states */}
        <Section title={`${selected} · 状态`}>
          <HStack gap={3} flexWrap="wrap">
            <Button colorPalette={selected}>Default</Button>
            <Button colorPalette={selected} disabled>Disabled</Button>
            <Button colorPalette={selected} loading>Loading</Button>
            <Button colorPalette={selected} size="xs">XS</Button>
            <Button colorPalette={selected} size="sm">SM</Button>
            <Button colorPalette={selected} size="md">MD</Button>
            <Button colorPalette={selected} size="lg">LG</Button>
          </HStack>
        </Section>

        {/* Badge */}
        <Section title={`${selected} · Badge`}>
          <HStack gap={3} flexWrap="wrap">
            <Badge colorPalette={selected} variant="solid">Solid</Badge>
            <Badge colorPalette={selected} variant="outline">Outline</Badge>
            <Badge colorPalette={selected} variant="subtle">Subtle</Badge>
            <Badge colorPalette={selected} variant="surface">Surface</Badge>
          </HStack>
        </Section>

        {/* 全 palette 缩略 */}
        <Section title="全 palette 缩略图（Solid 按钮 × 8 palette）">
          <Box display="grid" gridTemplateColumns="repeat(auto-fill, minmax(160px, 1fr))" gap={3}>
            {PALETTES.map((p) => (
              <Stack key={p} gap={2}>
                <Text fontSize="xs" fontFamily="mono" color="fg.subtle">{p}</Text>
                <Button colorPalette={p} size="sm">主操作</Button>
                <Button colorPalette={p} variant="outline" size="sm">次操作</Button>
                <Button colorPalette={p} variant="subtle" size="sm">弱操作</Button>
              </Stack>
            ))}
          </Box>
        </Section>

        <Text fontSize="xs" color="fg.subtle" textAlign="center" mt={8}>
          所有颜色来自 <code>docs/claude/token.json</code> · 修改后跑 <code>pnpm tokens:sync</code>
        </Text>
      </Stack>
    </Box>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box>
      <Text fontSize="xs" color="fg.subtle" textTransform="uppercase" letterSpacing="0.08em" mb={3} fontFamily="mono">
        {title}
      </Text>
      <Box bg="bg.surface" borderWidth="1px" borderColor="border.default" borderRadius="md" p={4}>
        {children}
      </Box>
    </Box>
  );
}
