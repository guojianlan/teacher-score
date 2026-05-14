import Link from 'next/link';
import { Box, Stack, Table, Tbody, Td, Text, Th, Thead, Tr } from '@/components/ui';
import { apiServer } from '@/lib/api-server';
import { PageHeader } from '@/components/page-header';

interface HistoryRow {
  id: string; subject: string; status: string;
  totalScore: number | null; maxScore: number | null; createdAt: string;
}

const SUBJECT_LABELS: Record<string, string> = { math: '数学', english: '英语', chinese: '语文', physics: '物理', chemistry: '化学' };

export default async function HistoryPage() {
  const data = await apiServer<{ rows: HistoryRow[] }>('/api/grade/history');
  const rows = data?.rows ?? [];
  return (
    <Stack gap={8}>
      <PageHeader
        eyebrow={`最近 ${rows.length} 次`}
        title="历史"
        description="时间倒序的所有批改记录。"
      />

      {rows.length === 0 ? (
        <Box py={16} textAlign="center" borderTop="1px solid" borderBottom="1px solid" borderColor="border.default">
          <Text fontFamily="mono" color="fg.subtle" fontSize="sm" mb={2}>EMPTY</Text>
          <Text color="fg.subtle">还没有批改记录。</Text>
        </Box>
      ) : (
        <Table size="md">
          <Thead>
            <Tr>
              <Th>时间</Th>
              <Th>学科</Th>
              <Th>状态</Th>
              <Th>分数</Th>
              <Th></Th>
            </Tr>
          </Thead>
          <Tbody>
            {rows.map((r) => (
              <Tr key={r.id} _hover={{ bg: 'bg.surfaceSubtle' }}>
                <Td color="fg.subtle" fontSize="sm" fontFamily="mono">{new Date(r.createdAt).toLocaleString('zh-CN')}</Td>
                <Td>{SUBJECT_LABELS[r.subject] ?? r.subject}</Td>
                <Td color="fg.subtle" fontSize="sm">{r.status}</Td>
                <Td fontFamily="mono">{r.totalScore ?? '—'} / {r.maxScore ?? '—'}</Td>
                <Td><Link href={`/grade/${r.id}`} style={{ color: '#0969DA', fontSize: 13 }}>查看 →</Link></Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}
    </Stack>
  );
}
