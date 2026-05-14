import { Box, Flex, Stack, Tag, Text } from '@chakra-ui/react';
import { apiServer } from '@/lib/api-server';
import { PageHeader } from '@/components/page-header';

interface Point { gradingId: string; subject: string; score: number; maxScore: number; pct: number; at: string | null; }
interface HeatmapRow { tag: string; count: number; }
interface SummaryRow { subject: string; count: number; avgPct: number; }

const SUBJECT_LABELS: Record<string, string> = { math: '数学', english: '英语', chinese: '语文', physics: '物理', chemistry: '化学' };

export default async function StudentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [progress, heatmap, summary] = await Promise.all([
    apiServer<{ points: Point[] }>(`/api/analytics/students/${id}/progress`),
    apiServer<{ heatmap: HeatmapRow[] }>(`/api/analytics/heatmap?studentId=${id}`),
    apiServer<{ summary: SummaryRow[] }>(`/api/analytics/summary?studentId=${id}`),
  ]);

  const points = progress?.points ?? [];
  const tags = heatmap?.heatmap ?? [];
  const sums = summary?.summary ?? [];
  const maxTag = tags[0]?.count ?? 1;

  return (
    <Stack spacing={10}>
      <PageHeader eyebrow="学情" title="学生详情" />

      <Section label="学科汇总">
        {sums.length === 0 ? (
          <Text color="ink.500" fontSize="sm">暂无数据</Text>
        ) : (
          <Flex gap={8} wrap="wrap">
            {sums.map((s) => (
              <Box key={s.subject}>
                <Text fontFamily="mono" fontSize="xs" color="ink.500" letterSpacing="0.08em" textTransform="uppercase" mb={1}>
                  {SUBJECT_LABELS[s.subject] ?? s.subject}
                </Text>
                <Flex align="baseline" gap={1}>
                  <Text fontFamily="mono" fontSize="3xl" fontWeight={500}>{Math.round(s.avgPct)}</Text>
                  <Text fontFamily="mono" color="ink.500" fontSize="sm">%</Text>
                </Flex>
                <Text fontFamily="mono" fontSize="xs" color="ink.500">{s.count} 次平均</Text>
              </Box>
            ))}
          </Flex>
        )}
      </Section>

      <Section label="知识点热力">
        {tags.length === 0 ? (
          <Text color="ink.500" fontSize="sm">暂无错题数据</Text>
        ) : (
          <Flex gap={2} wrap="wrap">
            {tags.slice(0, 50).map((h) => {
              const intensity = h.count / maxTag;
              return (
                <Tag key={h.tag} bg={`rgba(207, 34, 46, ${0.08 + intensity * 0.45})`} color="danger.500" border="1px solid" borderColor="danger.100">
                  {h.tag} <Text as="span" ml={1} fontFamily="mono">×{h.count}</Text>
                </Tag>
              );
            })}
          </Flex>
        )}
      </Section>

      <Section label="进步曲线">
        {points.length === 0 ? (
          <Text color="ink.500" fontSize="sm">暂无批改记录</Text>
        ) : (
          <Stack spacing={2}>
            {points.map((p) => (
              <Flex key={p.gradingId} align="center" gap={4}>
                <Text fontFamily="mono" fontSize="xs" w="80px" color="ink.500" flexShrink={0}>
                  {p.at ? new Date(p.at).toLocaleDateString('zh-CN') : '—'}
                </Text>
                <Text fontSize="sm" w="60px" flexShrink={0}>{SUBJECT_LABELS[p.subject] ?? p.subject}</Text>
                <Box flex="1" h="6px" bg="paper.200" borderRadius="full" overflow="hidden">
                  <Box h="100%" w={`${Math.min(100, p.pct)}%`} bg="accent.500" />
                </Box>
                <Text fontFamily="mono" fontSize="sm" w="100px" textAlign="right" color="ink.700">
                  {p.score}/{p.maxScore} · {p.pct}%
                </Text>
              </Flex>
            ))}
          </Stack>
        )}
      </Section>
    </Stack>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Box pb={8} borderBottom="1px solid" borderColor="ink.100">
      <Text fontFamily="mono" fontSize="xs" color="ink.500" letterSpacing="0.08em" textTransform="uppercase" mb={4}>
        {label}
      </Text>
      {children}
    </Box>
  );
}
