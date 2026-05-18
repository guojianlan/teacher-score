'use client';

/**
 * 班级 × 答题卡 批改聚合页（D13）
 * 显示该 gradingRunId 下所有学生的：状态、分数、错题数
 * 可点单条进 /history/[gradingId] 看明细
 */
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  Badge, Box, Button, Flex, Stack, Table, Tbody, Td, Text, Th, Thead, Tr,
} from '@/components/ui';
import { apiClient } from '@/lib/api-client';
import { PageHeader } from '@/components/page-header';

interface RunRecord {
  gradingId: string;
  studentId: string;
  studentName: string;
  examPaperId: string | null;
  status: string;
  progress: string | null;
  totalScore: number | null;
  maxScore: number | null;
  results: Array<{ isCorrect: boolean; score: number; maxScore: number }> | null;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
}

interface RunData {
  runId: string;
  template: { name: string; totalScore: number } | null;
  records: RunRecord[];
}

const STATUS_COLOR: Record<string, string> = {
  pending: 'neutral', queued: 'neutral', recognizing: 'warning', scoring: 'warning',
  finalizing: 'warning', completed: 'success', failed: 'danger',
};
const STATUS_LABEL: Record<string, string> = {
  pending: '等待', queued: '排队', recognizing: '识别中', scoring: '判分中',
  finalizing: '收尾', completed: '完成', failed: '失败',
};

export default function GradingRunPage() {
  const params = useParams<{ id: string }>();
  const runId = params?.id;
  const [data, setData] = useState<RunData | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    if (!runId) return;
    const res = await apiClient.get<RunData>(`/api/grade/runs/${runId}`);
    if (res.ok) setData(res.data);
    setLoading(false);
  };
  useEffect(() => {
    refresh();
    // 任务进行中时自动轮询
    const t = setInterval(() => {
      if (data?.records.some((r) => r.status !== 'completed' && r.status !== 'failed')) {
        refresh();
      }
    }, 3000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, data?.records.length]);

  if (loading) {
    return <Stack gap={4}><Text color="fg.subtle">载入中…</Text></Stack>;
  }
  if (!data) {
    return <Stack gap={4}>
      <Text color="status.danger.fg">找不到这次批改记录。</Text>
      <Button asChild variant="outline"><Link href="/grade">返回</Link></Button>
    </Stack>;
  }

  const total = data.records.length;
  const completed = data.records.filter((r) => r.status === 'completed').length;
  const failed = data.records.filter((r) => r.status === 'failed').length;
  const inFlight = total - completed - failed;
  const scoredRecords = data.records.filter((r) => r.status === 'completed' && r.totalScore !== null);
  const avgScore = scoredRecords.length > 0
    ? (scoredRecords.reduce((s, r) => s + (r.totalScore ?? 0), 0) / scoredRecords.length).toFixed(1)
    : '—';
  const maxOfRun = scoredRecords.length > 0 ? Math.max(...scoredRecords.map((r) => r.totalScore ?? 0)) : 0;
  const minOfRun = scoredRecords.length > 0 ? Math.min(...scoredRecords.map((r) => r.totalScore ?? 0)) : 0;

  return (
    <Stack gap={6}>
      <PageHeader
        eyebrow={`批改 · ${runId.slice(0, 12)}…`}
        title={data.template?.name ?? '批量批改'}
        description={data.template ? `满分 ${data.template.totalScore}` : ''}
      />

      {/* 总览卡片 */}
      <Box display="grid" gridTemplateColumns="repeat(auto-fit, minmax(140px, 1fr))" gap={3}>
        {[
          { label: '学生数', value: total },
          { label: '完成', value: completed },
          { label: '失败', value: failed },
          { label: '进行中', value: inFlight },
          { label: '平均分', value: avgScore },
          { label: '最高 / 最低', value: scoredRecords.length > 0 ? `${maxOfRun} / ${minOfRun}` : '—' },
        ].map((s) => (
          <Box key={s.label} borderWidth="1px" borderColor="border.default" borderRadius="md" p={3} bg="bg.surface">
            <Text fontSize="xs" color="fg.subtle" fontFamily="mono" textTransform="uppercase">
              {s.label}
            </Text>
            <Text fontSize="2xl" fontWeight={600} fontFamily="mono">{s.value}</Text>
          </Box>
        ))}
      </Box>

      {/* 学生表 */}
      <Box>
        <Table size="md">
          <Thead>
            <Tr>
              <Th>学生</Th>
              <Th>状态</Th>
              <Th>分数</Th>
              <Th>错题数</Th>
              <Th>耗时</Th>
              <Th></Th>
            </Tr>
          </Thead>
          <Tbody>
            {data.records.map((r) => {
              const wrongCount = r.results?.filter((q) => !q.isCorrect).length ?? null;
              const elapsed = r.completedAt && r.createdAt
                ? Math.round((new Date(r.completedAt).getTime() - new Date(r.createdAt).getTime()) / 1000)
                : null;
              return (
                <Tr key={r.gradingId} _hover={{ bg: 'bg.surfaceSubtle' }}>
                  <Td fontWeight={500}>{r.studentName}</Td>
                  <Td>
                    <Badge colorPalette={STATUS_COLOR[r.status] ?? 'neutral'} variant="subtle">
                      {STATUS_LABEL[r.status] ?? r.status}
                    </Badge>
                    {r.errorMessage && <Text fontSize="xs" color="status.danger.fg" mt={1}>{r.errorMessage}</Text>}
                  </Td>
                  <Td fontFamily="mono">
                    {r.totalScore !== null && r.maxScore !== null
                      ? `${r.totalScore} / ${r.maxScore}`
                      : '—'}
                  </Td>
                  <Td fontFamily="mono">{wrongCount ?? '—'}</Td>
                  <Td fontFamily="mono" color="fg.subtle" fontSize="sm">
                    {elapsed !== null ? `${elapsed}s` : '—'}
                  </Td>
                  <Td>
                    <Button asChild size="xs" variant="ghost">
                      <Link href={`/history/${r.gradingId}`}>详情</Link>
                    </Button>
                  </Td>
                </Tr>
              );
            })}
          </Tbody>
        </Table>
      </Box>

      {/* 导出 CSV */}
      <Box>
        <Button
          size="sm"
          variant="outline"
          onClick={() => downloadCsv(data)}
          disabled={completed === 0}
        >
          导出 CSV
        </Button>
      </Box>
    </Stack>
  );
}

function downloadCsv(data: RunData) {
  const rows = [
    ['学生', '状态', '分数', '满分', '错题数', '耗时(s)', 'gradingId'],
    ...data.records.map((r) => {
      const wrong = r.results?.filter((q) => !q.isCorrect).length ?? '';
      const elapsed = r.completedAt && r.createdAt
        ? Math.round((new Date(r.completedAt).getTime() - new Date(r.createdAt).getTime()) / 1000)
        : '';
      return [
        r.studentName, r.status,
        r.totalScore ?? '', r.maxScore ?? '',
        wrong, elapsed, r.gradingId,
      ];
    }),
  ];
  const csv = rows.map((row) =>
    row.map((cell) => {
      const s = String(cell);
      return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(',')
  ).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${data.runId}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
