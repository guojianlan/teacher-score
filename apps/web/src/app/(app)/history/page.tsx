import Link from 'next/link';
import { Box, Heading, Stack, Table, Tbody, Td, Th, Thead, Tr } from '@chakra-ui/react';
import { apiServer } from '@/lib/api-server';

interface HistoryRow {
  id: string;
  subject: string;
  status: string;
  totalScore: number | null;
  maxScore: number | null;
  createdAt: string;
}

const SUBJECT_LABELS: Record<string, string> = {
  math: '数学',
  english: '英语',
  chinese: '语文',
  physics: '物理',
  chemistry: '化学',
};

export default async function HistoryPage() {
  const data = await apiServer<{ rows: HistoryRow[] }>('/api/grade/history');
  const rows = data?.rows ?? [];
  return (
    <Stack spacing={4}>
      <Heading size="lg">历史</Heading>
      <Box bg="white" rounded="md" borderWidth="1px" overflow="hidden">
        <Table>
          <Thead bg="gray.50">
            <Tr>
              <Th>时间</Th>
              <Th>学科</Th>
              <Th>状态</Th>
              <Th>分数</Th>
              <Th>详情</Th>
            </Tr>
          </Thead>
          <Tbody>
            {rows.length === 0 ? (
              <Tr>
                <Td colSpan={5}>
                  <Box py={6} textAlign="center" color="gray.500">
                    暂无历史
                  </Box>
                </Td>
              </Tr>
            ) : (
              rows.map((r) => (
                <Tr key={r.id}>
                  <Td>{new Date(r.createdAt).toLocaleString('zh-CN')}</Td>
                  <Td>{SUBJECT_LABELS[r.subject] ?? r.subject}</Td>
                  <Td>{r.status}</Td>
                  <Td>
                    {r.totalScore ?? '-'} / {r.maxScore ?? '-'}
                  </Td>
                  <Td>
                    <Link href={`/grade/${r.id}`} style={{ color: '#2563eb' }}>
                      查看
                    </Link>
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
