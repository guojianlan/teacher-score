'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Flex,
  Heading,
  Input,
  Select,
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
import { SUBJECTS } from '@teacher-score/types';

const SUBJECT_LABELS: Record<string, string> = {
  math: '数学',
  english: '英语',
  chinese: '语文',
  physics: '物理',
  chemistry: '化学',
};

interface MistakeRow {
  id: string;
  subject: string;
  questionStem: string;
  occurrences: number;
  lastSeenAt: string;
  firstSeenAt: string;
  knowledgeTags: string[];
  mastered: boolean;
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

  useEffect(() => {
    refresh();
  }, []);

  const filtered = useMemo(() => {
    let out = rows;
    if (!showMastered) out = out.filter((r) => !r.mastered);
    if (subject) out = out.filter((r) => r.subject === subject);
    if (search) {
      const s = search.toLowerCase();
      out = out.filter(
        (r) =>
          r.questionStem.toLowerCase().includes(s) ||
          (r.knowledgeTags ?? []).some((t) => t.toLowerCase().includes(s)),
      );
    }
    return [...out].sort((a, b) => {
      if (sortKey === 'occurrences') return b.occurrences - a.occurrences;
      if (sortKey === 'lastSeenAt')
        return new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime();
      if (sortKey === 'firstSeenAt')
        return new Date(b.firstSeenAt).getTime() - new Date(a.firstSeenAt).getTime();
      const at = (a.knowledgeTags ?? []).join();
      const bt = (b.knowledgeTags ?? []).join();
      return at.localeCompare(bt);
    });
  }, [rows, search, subject, showMastered, sortKey]);

  const onMastered = async (id: string) => {
    const res = await apiClient.post(`/api/mistakes/${id}/master`);
    if (res.ok) {
      toast({ status: 'success', title: '已标记为已掌握' });
      refresh();
    } else toast({ status: 'error', title: '操作失败' });
  };

  return (
    <Stack spacing={4}>
      <Heading size="lg">错题本</Heading>

      <Flex gap={3} bg="white" p={4} rounded="md" borderWidth="1px" wrap="wrap">
        <Input
          placeholder="搜索题干或知识点"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          maxW="280px"
        />
        <Select value={subject} onChange={(e) => setSubject(e.target.value)} maxW="160px">
          <option value="">全部学科</option>
          {SUBJECTS.map((s) => (
            <option key={s} value={s}>
              {SUBJECT_LABELS[s]}
            </option>
          ))}
        </Select>
        <Select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)} maxW="160px">
          <option value="occurrences">按错误次数</option>
          <option value="lastSeenAt">按最近</option>
          <option value="firstSeenAt">按最早</option>
          <option value="tag">按知识点</option>
        </Select>
        <Button
          size="sm"
          variant={showMastered ? 'solid' : 'outline'}
          onClick={() => setShowMastered((v) => !v)}
        >
          {showMastered ? '隐藏已掌握' : '显示已掌握'}
        </Button>
      </Flex>

      <Box bg="white" rounded="md" borderWidth="1px" overflow="hidden">
        <Table>
          <Thead bg="gray.50">
            <Tr>
              <Th>题目</Th>
              <Th>学科</Th>
              <Th>知识点</Th>
              <Th isNumeric>错误次数</Th>
              <Th>最近</Th>
              <Th>操作</Th>
            </Tr>
          </Thead>
          <Tbody>
            {filtered.length === 0 ? (
              <Tr>
                <Td colSpan={6}>
                  <Box py={6} textAlign="center" color="gray.500">
                    没有匹配的错题
                  </Box>
                </Td>
              </Tr>
            ) : (
              filtered.map((r) => (
                <Tr key={r.id} opacity={r.mastered ? 0.5 : 1}>
                  <Td maxW="400px" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">
                    {r.questionStem}
                  </Td>
                  <Td>
                    <Badge>{SUBJECT_LABELS[r.subject] ?? r.subject}</Badge>
                  </Td>
                  <Td>
                    {(r.knowledgeTags ?? []).map((t) => (
                      <Badge key={t} mr={1} colorScheme="red">
                        {t}
                      </Badge>
                    ))}
                  </Td>
                  <Td isNumeric>{r.occurrences}</Td>
                  <Td>{new Date(r.lastSeenAt).toLocaleString('zh-CN')}</Td>
                  <Td>
                    {r.mastered ? (
                      <Badge colorScheme="green">已掌握</Badge>
                    ) : (
                      <Button size="xs" onClick={() => onMastered(r.id)}>
                        标记已掌握
                      </Button>
                    )}
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
