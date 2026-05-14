'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Badge, Box, Button, Flex, Input, Select, Stack, Table, Tbody, Td, Text, Th, Thead, Tr, useToast,
} from '@chakra-ui/react';
import { apiClient } from '@/lib/api-client';
import { PageHeader } from '@/components/page-header';
import { SUBJECTS } from '@teacher-score/types';

const SUBJECT_LABELS: Record<string, string> = { math: '数学', english: '英语', chinese: '语文', physics: '物理', chemistry: '化学' };

interface MistakeRow {
  id: string; subject: string; questionStem: string; occurrences: number;
  lastSeenAt: string; firstSeenAt: string; knowledgeTags: string[]; mastered: boolean;
}

type SortKey = 'occurrences' | 'lastSeenAt' | 'firstSeenAt' | 'tag';

export default function MistakesPage() {
  const toast = useToast();
  const [rows, setRows] = useState<MistakeRow[]>([]);
  const [search, setSearch] = useState('');
  const [subject, setSubject] = useState('');
  const [showMastered, setShowMastered] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('occurrences');

  const refresh = async () => {
    const res = await apiClient.get<{ mistakes: MistakeRow[] }>('/api/mistakes');
    if (res.ok) setRows(res.data.mistakes);
  };
  useEffect(() => { refresh(); }, []);

  const filtered = useMemo(() => {
    let out = rows;
    if (!showMastered) out = out.filter((r) => !r.mastered);
    if (subject) out = out.filter((r) => r.subject === subject);
    if (search) {
      const s = search.toLowerCase();
      out = out.filter((r) => r.questionStem.toLowerCase().includes(s) || (r.knowledgeTags ?? []).some((t) => t.toLowerCase().includes(s)));
    }
    return [...out].sort((a, b) => {
      if (sortKey === 'occurrences') return b.occurrences - a.occurrences;
      if (sortKey === 'lastSeenAt') return new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime();
      if (sortKey === 'firstSeenAt') return new Date(b.firstSeenAt).getTime() - new Date(a.firstSeenAt).getTime();
      return (a.knowledgeTags ?? []).join().localeCompare((b.knowledgeTags ?? []).join());
    });
  }, [rows, search, subject, showMastered, sortKey]);

  const onMastered = async (id: string) => {
    const res = await apiClient.post(`/api/mistakes/${id}/master`);
    if (res.ok) { toast({ status: 'success', title: '已标记' }); refresh(); }
    else toast({ status: 'error', title: '失败' });
  };

  return (
    <Stack spacing={8}>
      <PageHeader
        eyebrow={`共 ${rows.length} 题 · 未掌握 ${rows.filter((r) => !r.mastered).length}`}
        title="错题本"
        description="按 questionHash 自动去重，按知识点 / 出现次数 / 时间排序。"
      />

      <Flex gap={3} wrap="wrap">
        <Input placeholder="搜索题干或知识点" value={search} onChange={(e) => setSearch(e.target.value)} maxW="280px" size="md" />
        <Select value={subject} onChange={(e) => setSubject(e.target.value)} maxW="160px" size="md">
          <option value="">全部学科</option>
          {SUBJECTS.map((s) => <option key={s} value={s}>{SUBJECT_LABELS[s]}</option>)}
        </Select>
        <Select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)} maxW="160px" size="md">
          <option value="occurrences">按错误次数</option>
          <option value="lastSeenAt">按最近</option>
          <option value="firstSeenAt">按最早</option>
          <option value="tag">按知识点</option>
        </Select>
        <Button size="md" variant={showMastered ? 'solid' : 'outline'} onClick={() => setShowMastered((v) => !v)}>
          {showMastered ? '隐藏已掌握' : '显示已掌握'}
        </Button>
      </Flex>

      {filtered.length === 0 ? (
        <Box py={16} textAlign="center" borderTop="1px solid" borderBottom="1px solid" borderColor="ink.100">
          <Text fontFamily="mono" color="ink.500" fontSize="sm" mb={2}>EMPTY</Text>
          <Text color="ink.500">没有匹配的错题。</Text>
        </Box>
      ) : (
        <Table size="md">
          <Thead>
            <Tr>
              <Th>题目</Th>
              <Th>学科</Th>
              <Th>知识点</Th>
              <Th isNumeric>次数</Th>
              <Th>最近</Th>
              <Th></Th>
            </Tr>
          </Thead>
          <Tbody>
            {filtered.map((r) => (
              <Tr key={r.id} opacity={r.mastered ? 0.5 : 1} _hover={{ bg: 'paper.100' }}>
                <Td maxW="380px" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">{r.questionStem}</Td>
                <Td color="ink.500" fontSize="sm">{SUBJECT_LABELS[r.subject] ?? r.subject}</Td>
                <Td>
                  <Flex gap={1} wrap="wrap">
                    {(r.knowledgeTags ?? []).map((t) => <Badge key={t} bg="paper.200" color="ink.700">{t}</Badge>)}
                  </Flex>
                </Td>
                <Td isNumeric fontFamily="mono" fontWeight={500}>{r.occurrences}</Td>
                <Td color="ink.500" fontSize="sm" fontFamily="mono">{new Date(r.lastSeenAt).toLocaleDateString('zh-CN')}</Td>
                <Td>
                  {r.mastered
                    ? <Badge bg="success.100" color="success.500">已掌握</Badge>
                    : <Button size="xs" variant="ghost" onClick={() => onMastered(r.id)}>标记掌握</Button>}
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}
    </Stack>
  );
}
