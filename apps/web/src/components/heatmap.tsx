'use client';

import { Badge, Box, Flex, Stack, Text } from '@/components/ui';

export interface HeatmapBucket {
  tag: string;
  totalOccurrences: number;
  questionCount: number;
  studentCount: number;
  masteredCount: number;
}

/**
 * 知识点热力图组件 · 复用学生 + 班级
 * 每个 tag 一条横向条，宽度按错误次数比例。
 * 颜色：红 = 高频错题，黄 = 中频，绿 = 已掌握多。
 */
export function Heatmap({
  buckets,
  showStudentCount = false,
}: {
  buckets: HeatmapBucket[];
  showStudentCount?: boolean;
}) {
  if (buckets.length === 0) {
    return (
      <Box py={12} textAlign="center" bg="bg.surfaceSubtle" borderRadius="md">
        <Text color="fg.subtle">暂无错题数据。多批改几张答卷后这里会显示薄弱知识点。</Text>
      </Box>
    );
  }

  const maxOcc = Math.max(...buckets.map((b) => b.totalOccurrences));

  return (
    <Stack gap={2}>
      {buckets.map((b) => {
        const masteryRate = b.questionCount > 0 ? b.masteredCount / b.questionCount : 0;
        const occRatio = b.totalOccurrences / maxOcc;
        const palette = masteryRate >= 0.5 ? 'success' : occRatio > 0.6 ? 'danger' : 'warning';
        return (
          <Flex
            key={b.tag}
            gap={3} align="center"
            p={3}
            borderWidth="1px" borderColor="border.default" borderRadius="md"
            bg="bg.surface"
          >
            <Box minW="200px">
              <Text fontWeight={500} fontSize="sm">{b.tag}</Text>
              <Text fontSize="xs" color="fg.subtle" fontFamily="mono">
                {b.questionCount} 题 · 错 {b.totalOccurrences} 次
                {showStudentCount && ` · ${b.studentCount} 学生`}
                {b.masteredCount > 0 && ` · ${b.masteredCount} 已掌握`}
              </Text>
            </Box>
            <Box flex="1" h="22px" bg="bg.muted" borderRadius="full" overflow="hidden" position="relative">
              <Box
                h="100%"
                w={`${occRatio * 100}%`}
                bg={`${palette}.solid`}
                opacity={0.8}
                transition="width 0.3s"
              />
              <Text
                position="absolute" top="50%" left="8px"
                transform="translateY(-50%)"
                fontSize="xs" fontFamily="mono"
                color={occRatio > 0.5 ? 'white' : 'fg.default'}
              >
                {b.totalOccurrences}
              </Text>
            </Box>
            <Badge colorPalette={palette} variant="subtle" minW="64px" textAlign="center">
              {masteryRate >= 0.5 ? '已巩固' : occRatio > 0.6 ? '薄弱' : '关注'}
            </Badge>
          </Flex>
        );
      })}
    </Stack>
  );
}
