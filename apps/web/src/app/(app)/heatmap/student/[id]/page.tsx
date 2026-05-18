'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Box, Button, Flex, Stack, Text } from '@/components/ui';
import { Heatmap, type HeatmapBucket } from '@/components/heatmap';
import { apiClient } from '@/lib/api-client';
import { PageHeader } from '@/components/page-header';

interface Resp {
  student: { id: string; name: string } | null;
  buckets: HeatmapBucket[];
  totalQuestions: number;
}

export default function StudentHeatmapPage() {
  const params = useParams<{ id: string }>();
  const studentId = params?.id;
  const [data, setData] = useState<Resp | null>(null);

  useEffect(() => {
    if (!studentId) return;
    apiClient.get<Resp>(`/api/heatmap/students/${studentId}`).then((r) => {
      if (r.ok) setData(r.data);
    });
  }, [studentId]);

  if (!data) {
    return <Text color="fg.subtle">载入中…</Text>;
  }

  return (
    <Stack gap={6}>
      <Flex justify="space-between" align="flex-start" flexWrap="wrap" gap={4}>
        <PageHeader
          eyebrow="学情"
          title={data.student?.name ?? studentId}
          description={`${data.totalQuestions} 道错题，按知识点聚合。错误次数越多颜色越深。`}
        />
        <Button asChild variant="ghost" size="sm"><Link href="/students">← 返回学生</Link></Button>
      </Flex>

      <Heatmap buckets={data.buckets} />
    </Stack>
  );
}
