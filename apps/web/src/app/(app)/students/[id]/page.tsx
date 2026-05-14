import { Box, Heading, SimpleGrid, Stack, Stat, StatLabel, StatNumber, Tag, Text } from '@chakra-ui/react';
import { apiServer } from '@/lib/api-server';

interface Point {
  gradingId: string;
  subject: string;
  score: number;
  maxScore: number;
  pct: number;
  at: string | null;
}

interface HeatmapRow {
  tag: string;
  count: number;
}

interface SummaryRow {
  subject: string;
  count: number;
  avgPct: number;
}

const SUBJECT_LABELS: Record<string, string> = {
  math: '数学',
  english: '英语',
  chinese: '语文',
  physics: '物理',
  chemistry: '化学',
};

export default async function StudentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [progress, heatmap, summary] = await Promise.all([
    apiServer<{ points: Point[] }>(`/api/analytics/students/${id}/progress`),
    apiServer<{ heatmap: HeatmapRow[] }>(`/api/analytics/heatmap?studentId=${id}`),
    apiServer<{ summary: SummaryRow[] }>(`/api/analytics/summary?studentId=${id}`),
  ]);

  return (
    <Stack spacing={6}>
      <Heading size="lg">学情</Heading>

      <Box bg="white" rounded="md" borderWidth="1px" p={5}>
        <Heading size="md" mb={3}>
          学科汇总
        </Heading>
        <SimpleGrid columns={{ base: 2, md: 5 }} spacing={4}>
          {(summary?.summary ?? []).map((s) => (
            <Stat key={s.subject}>
              <StatLabel>{SUBJECT_LABELS[s.subject] ?? s.subject}</StatLabel>
              <StatNumber>
                {Math.round(s.avgPct)}%
              </StatNumber>
              <Text fontSize="xs" color="gray.500">
                共 {s.count} 次
              </Text>
            </Stat>
          ))}
          {(summary?.summary ?? []).length === 0 && (
            <Text color="gray.500">暂无数据</Text>
          )}
        </SimpleGrid>
      </Box>

      <Box bg="white" rounded="md" borderWidth="1px" p={5}>
        <Heading size="md" mb={3}>
          知识点热力图
        </Heading>
        <Box>
          {(heatmap?.heatmap ?? []).slice(0, 30).map((h) => (
            <Tag key={h.tag} m={1} colorScheme="red" size="md">
              {h.tag} × {h.count}
            </Tag>
          ))}
          {(heatmap?.heatmap ?? []).length === 0 && (
            <Text color="gray.500">暂无错题数据</Text>
          )}
        </Box>
      </Box>

      <Box bg="white" rounded="md" borderWidth="1px" p={5}>
        <Heading size="md" mb={3}>
          进步曲线（最近批改）
        </Heading>
        <ProgressList points={progress?.points ?? []} />
      </Box>
    </Stack>
  );
}

function ProgressList({ points }: { points: Point[] }) {
  if (points.length === 0) return <Text color="gray.500">暂无批改记录</Text>;
  return (
    <Stack spacing={2}>
      {points.map((p) => (
        <Box key={p.gradingId} display="flex" alignItems="center" gap={3}>
          <Text fontSize="sm" w="160px" color="gray.500">
            {p.at ? new Date(p.at).toLocaleDateString('zh-CN') : '-'}
          </Text>
          <Tag size="sm">{SUBJECT_LABELS[p.subject] ?? p.subject}</Tag>
          <Box flex="1">
            <Box h="6px" bg="gray.100" rounded="full" overflow="hidden">
              <Box h="6px" w={`${Math.min(100, p.pct)}%`} bg="brand.400" />
            </Box>
          </Box>
          <Text fontSize="sm" w="80px" textAlign="right">
            {p.score} / {p.maxScore}（{p.pct}%）
          </Text>
        </Box>
      ))}
    </Stack>
  );
}
