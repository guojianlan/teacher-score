'use client';

import { useEffect, useState } from 'react';
import { Badge, Box, Button, Stack, Table, Tbody, Td, Text, Th, Thead, Tr, useToast } from '@chakra-ui/react';
import { apiClient } from '@/lib/api-client';
import { PageHeader } from '@/components/page-header';

interface Template {
  id: string; name: string; subject: string; grade: string | null;
  totalScore: number; questions: unknown[]; createdAt: string;
}

const SUBJECT_LABELS: Record<string, string> = { math: '数学', english: '英语', chinese: '语文', physics: '物理', chemistry: '化学' };

export default function TemplatesPage() {
  const toast = useToast();
  const [templates, setTemplates] = useState<Template[]>([]);

  const refresh = async () => {
    const res = await apiClient.get<{ templates: Template[] }>('/api/templates');
    if (res.ok) setTemplates(res.data.templates);
  };
  useEffect(() => { refresh(); }, []);

  const onDelete = async (id: string) => {
    if (!confirm('删除模板？已使用过的批改记录保留。')) return;
    const res = await apiClient.delete(`/api/templates/${id}`);
    if (res.ok) { toast({ status: 'success', title: '已删除' }); refresh(); }
    else toast({ status: 'error', title: '删除失败' });
  };

  return (
    <Stack spacing={8}>
      <PageHeader
        eyebrow={`${templates.length} 个模板`}
        title="试卷模板"
        description="在批改结果页可一键保存为模板。复用模板时跳过题目识别，节省 LLM 调用。"
      />

      {templates.length === 0 ? (
        <Box py={16} textAlign="center" borderTop="1px solid" borderBottom="1px solid" borderColor="border.base">
          <Text fontFamily="mono" color="text.fgSubtle" fontSize="sm" mb={2}>EMPTY</Text>
          <Text color="text.fgSubtle">还没有模板。完成一次批改后可"保存为模板"。</Text>
        </Box>
      ) : (
        <Table size="md">
          <Thead>
            <Tr>
              <Th>名称</Th>
              <Th>学科</Th>
              <Th>年级</Th>
              <Th isNumeric>总分</Th>
              <Th isNumeric>题数</Th>
              <Th>创建</Th>
              <Th></Th>
            </Tr>
          </Thead>
          <Tbody>
            {templates.map((t) => (
              <Tr key={t.id} _hover={{ bg: 'bg.subtle' }}>
                <Td fontWeight={500}>{t.name}</Td>
                <Td><Badge bg="bg.muted" color="text.fgMuted">{SUBJECT_LABELS[t.subject] ?? t.subject}</Badge></Td>
                <Td color="text.fgSubtle">{t.grade ?? '—'}</Td>
                <Td isNumeric fontFamily="mono">{t.totalScore}</Td>
                <Td isNumeric fontFamily="mono">{Array.isArray(t.questions) ? t.questions.length : 0}</Td>
                <Td color="text.fgSubtle" fontSize="sm" fontFamily="mono">{new Date(t.createdAt).toLocaleDateString('zh-CN')}</Td>
                <Td><Button size="xs" variant="ghost" color="red.700" onClick={() => onDelete(t.id)}>删除</Button></Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}
    </Stack>
  );
}
