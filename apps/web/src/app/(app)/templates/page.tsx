'use client';

import { useEffect, useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Flex,
  Heading,
  Stack,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  useToast,
} from '@chakra-ui/react';
import { apiClient } from '@/lib/api-client';

interface Template {
  id: string;
  name: string;
  subject: string;
  grade: string | null;
  totalScore: number;
  questions: unknown[];
  createdAt: string;
}

const SUBJECT_LABELS: Record<string, string> = {
  math: '数学',
  english: '英语',
  chinese: '语文',
  physics: '物理',
  chemistry: '化学',
};

export default function TemplatesPage() {
  const toast = useToast();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    const res = await apiClient.get<{ templates: Template[] }>('/api/templates');
    if (res.ok) setTemplates(res.data.templates);
    setLoading(false);
  };

  useEffect(() => {
    refresh();
  }, []);

  const onDelete = async (id: string) => {
    if (!confirm('删除模板？已使用过该模板的批改记录保留。')) return;
    const res = await apiClient.delete(`/api/templates/${id}`);
    if (res.ok) {
      toast({ status: 'success', title: '已删除' });
      refresh();
    } else toast({ status: 'error', title: '删除失败' });
  };

  return (
    <Stack spacing={4}>
      <Flex align="center">
        <Heading size="lg">试卷模板</Heading>
        <Box flex="1" />
      </Flex>

      <Box bg="white" rounded="md" borderWidth="1px" overflow="hidden">
        <Table>
          <Thead bg="gray.50">
            <Tr>
              <Th>名称</Th>
              <Th>学科</Th>
              <Th>年级</Th>
              <Th>总分</Th>
              <Th>题目数</Th>
              <Th>创建时间</Th>
              <Th>操作</Th>
            </Tr>
          </Thead>
          <Tbody>
            {loading ? null : templates.length === 0 ? (
              <Tr>
                <Td colSpan={7}>
                  <Box py={6} textAlign="center" color="gray.500">
                    暂无模板。在批改结果页可一键保存为模板。
                  </Box>
                </Td>
              </Tr>
            ) : (
              templates.map((t) => (
                <Tr key={t.id}>
                  <Td fontWeight="semibold">{t.name}</Td>
                  <Td>
                    <Badge>{SUBJECT_LABELS[t.subject] ?? t.subject}</Badge>
                  </Td>
                  <Td>{t.grade ?? '-'}</Td>
                  <Td>{t.totalScore}</Td>
                  <Td>{Array.isArray(t.questions) ? t.questions.length : 0}</Td>
                  <Td>{new Date(t.createdAt).toLocaleString('zh-CN')}</Td>
                  <Td>
                    <Button size="xs" colorScheme="red" variant="ghost" onClick={() => onDelete(t.id)}>
                      删除
                    </Button>
                  </Td>
                </Tr>
              ))
            )}
          </Tbody>
        </Table>
      </Box>
    </Stack>
  );
}
