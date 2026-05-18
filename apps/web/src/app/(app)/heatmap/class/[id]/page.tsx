'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Box, Button, Flex, Stack, Text } from '@/components/ui';
import { Heatmap, type HeatmapBucket } from '@/components/heatmap';
import { apiClient } from '@/lib/api-client';
import { PageHeader } from '@/components/page-header';

interface Resp {
  class: { id: string; name: string; studentCount: number } | null;
  buckets: HeatmapBucket[];
  totalQuestions: number;
}

export default function ClassHeatmapPage() {
  const params = useParams<{ id: string }>();
  const classId = params?.id;
  const [data, setData] = useState<Resp | null>(null);

  useEffect(() => {
    if (!classId) return;
    apiClient.get<Resp>(`/api/heatmap/classes/${classId}`).then((r) => {
      if (r.ok) setData(r.data);
    });
  }, [classId]);

  if (!data) {
    return <Text color="fg.subtle">载入中…</Text>;
  }

  return (
    <Stack gap={6}>
      <Flex justify="space-between" align="flex-start" flexWrap="wrap" gap={4}>
        <PageHeader
          eyebrow={`班级 · ${data.class?.studentCount ?? 0} 人`}
          title={data.class?.name ?? classId}
          description={`全班 ${data.totalQuestions} 道错题归集后按知识点聚合。多少学生命中、错多少次。`}
        />
        <Button asChild variant="ghost" size="sm"><Link href="/classes">← 返回班级</Link></Button>
      </Flex>

      <Heatmap buckets={data.buckets} showStudentCount />
    </Stack>
  );
}
