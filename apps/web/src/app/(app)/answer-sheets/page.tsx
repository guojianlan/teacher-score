'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Badge, Box, Button, Flex, HStack, Stack, Table, Tbody, Td, Text, Th, Thead, Tr, useToast,
} from '@/components/ui';
import { apiClient } from '@/lib/api-client';
import { PageHeader } from '@/components/page-header';

interface Sheet {
  id: string;
  name: string;
  subject: string;
  grade: string | null;
  totalScore: number;
  questions: unknown[];
  layout: unknown | null;        // null = 旧扁平模板；非 null = 新答题卡
  createdAt: string;
}

const SUBJECT_LABELS: Record<string, string> = {
  math: '数学', english: '英语', chinese: '语文', physics: '物理', chemistry: '化学',
};

export default function AnswerSheetsPage() {
  const toast = useToast();
  const [sheets, setSheets] = useState<Sheet[]>([]);

  const refresh = async () => {
    const res = await apiClient.get<{ templates: Sheet[] }>('/api/templates');
    if (res.ok) setSheets(res.data.templates);
  };
  useEffect(() => { refresh(); }, []);

  const onDelete = async (id: string) => {
    if (!confirm('删除答题卡？已用它批改过的记录保留。')) return;
    const res = await apiClient.delete(`/api/templates/${id}`);
    if (res.ok) { toast({ status: 'success', title: '已删除' }); refresh(); }
    else toast({ status: 'error', title: '删除失败' });
  };

  return (
    <Stack gap={8}>
      <Flex justify="space-between" align="flex-start" flexWrap="wrap" gap={4}>
        <PageHeader
          eyebrow={`${sheets.length} 张`}
          title="答题卡"
          description="一份 schema 三个出口：录入题目和答案 → 导出 PDF 给学生打印 → 拍回来按结构判分。"
        />
        <Button asChild colorPalette="primary" size="md">
          <Link href="/answer-sheets/new">+ 新建答题卡</Link>
        </Button>
      </Flex>

      {sheets.length === 0 ? (
        <Box py={16} textAlign="center" borderTop="1px solid" borderBottom="1px solid" borderColor="border.default">
          <Text fontFamily="mono" color="fg.subtle" fontSize="sm" mb={2}>EMPTY</Text>
          <Text color="fg.subtle" mb={4}>还没有答题卡。点右上角「新建答题卡」开始。</Text>
        </Box>
      ) : (
        <Table size="md">
          <Thead>
            <Tr>
              <Th>名称</Th>
              <Th>学科</Th>
              <Th>年级</Th>
              <Th>总分</Th>
              <Th>题数</Th>
              <Th>类型</Th>
              <Th>创建</Th>
              <Th></Th>
            </Tr>
          </Thead>
          <Tbody>
            {sheets.map((t) => {
              const isNew = t.layout !== null && t.layout !== undefined;
              return (
                <Tr key={t.id} _hover={{ bg: 'bg.surfaceSubtle' }}>
                  <Td fontWeight={500}>{t.name}</Td>
                  <Td>
                    <Badge colorPalette="neutral" variant="subtle">
                      {SUBJECT_LABELS[t.subject] ?? t.subject}
                    </Badge>
                  </Td>
                  <Td color="fg.subtle">{t.grade ?? '—'}</Td>
                  <Td fontFamily="mono">{t.totalScore}</Td>
                  <Td fontFamily="mono">{Array.isArray(t.questions) ? t.questions.length : 0}</Td>
                  <Td>
                    {isNew ? (
                      <Badge colorPalette="primary" variant="subtle">新</Badge>
                    ) : (
                      <Badge colorPalette="neutral" variant="subtle">旧扁平</Badge>
                    )}
                  </Td>
                  <Td color="fg.subtle" fontSize="sm" fontFamily="mono">
                    {new Date(t.createdAt).toLocaleDateString('zh-CN')}
                  </Td>
                  <Td>
                    <HStack gap={1}>
                      {isNew && (
                        <>
                          <Button asChild size="xs" variant="ghost">
                            <a href={`/api/templates/${t.id}/pdf`} target="_blank" rel="noopener noreferrer">
                              预览
                            </a>
                          </Button>
                          <Button asChild size="xs" variant="ghost">
                            <a href={`/api/templates/${t.id}/pdf?download=1`}>下载</a>
                          </Button>
                        </>
                      )}
                      <Button size="xs" variant="ghost" colorPalette="danger" onClick={() => onDelete(t.id)}>
                        删除
                      </Button>
                    </HStack>
                  </Td>
                </Tr>
              );
            })}
          </Tbody>
        </Table>
      )}
    </Stack>
  );
}
