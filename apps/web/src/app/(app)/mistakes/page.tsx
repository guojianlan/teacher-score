'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Badge, Box, Button, Flex, Input, Select, Stack, Table, Tbody, Td, Text, Th, Thead, Tr, useToast,
} from '@/components/ui';
import { apiClient } from '@/lib/api-client';
import { PageHeader } from '@/components/page-header';
import { SUBJECTS } from '@teacher-score/types';

const SUBJECT_LABELS: Record<string, string> = { math: '数学', english: '英语', chinese: '语文', physics: '物理', chemistry: '化学' };

interface MistakeRow {
  id: string; subject: string; questionStem: string; occurrences: number;
  lastSeenAt: string; firstSeenAt: string; knowledgeTags: string[]; mastered: boolean;
}

type SortKey = 'occurrences' | 'lastSeenAt' | 'firstSeenAt' | 'tag';
type ViewMode = 'flat' | 'byTag';

export default function MistakesPage() {
  const toast = useToast();
  const [rows, setRows] = useState<MistakeRow[]>([]);
  const [search, setSearch] = useState('');
  const [subject, setSubject] = useState('');
  const [showMastered, setShowMastered] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('occurrences');
  const [viewMode, setViewMode] = useState<ViewMode>('flat');

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

  // 按知识点聚合
  const byTag = useMemo(() => {
    const map: Record<string, MistakeRow[]> = {};
    for (const r of filtered) {
      const tags = r.knowledgeTags ?? [];
      if (tags.length === 0) {
        (map['(无标签)'] ??= []).push(r);
      } else {
        for (const t of tags) (map[t] ??= []).push(r);
      }
    }
    return Object.entries(map)
      .map(([tag, items]) => ({
        tag,
        items,
        totalOccurrences: items.reduce((s, x) => s + x.occurrences, 0),
      }))
      .sort((a, b) => b.totalOccurrences - a.totalOccurrences);
  }, [filtered]);

  const onMastered = async (id: string) => {
    const res = await apiClient.post(`/api/mistakes/${id}/master`);
    if (res.ok) { toast({ status: 'success', title: '已标记' }); refresh(); }
    else toast({ status: 'error', title: '失败' });
  };

  return (
    <Stack gap={8}>
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
        <Button
          size="md"
          variant={viewMode === 'byTag' ? 'solid' : 'outline'}
          colorPalette="primary"
          onClick={() => setViewMode((v) => v === 'flat' ? 'byTag' : 'flat')}
        >
          {viewMode === 'byTag' ? '平铺视图' : '按知识点聚合'}
        </Button>
      </Flex>

      {filtered.length === 0 ? (
        <Box py={16} textAlign="center" borderTop="1px solid" borderBottom="1px solid" borderColor="border.default">
          <Text fontFamily="mono" color="fg.subtle" fontSize="sm" mb={2}>EMPTY</Text>
          <Text color="fg.subtle">没有匹配的错题。</Text>
        </Box>
      ) : viewMode === 'byTag' ? (
        <Stack gap={4}>
          {byTag.map((group) => (
            <Box key={group.tag} borderWidth="1px" borderColor="border.default" borderRadius="md" overflow="hidden">
              <Flex
                justify="space-between" align="center" p={3}
                bg="bg.surfaceSubtle" borderBottomWidth="1px" borderColor="border.default"
              >
                <Flex gap={3} align="center">
                  <Badge colorPalette="primary" variant="subtle">{group.tag}</Badge>
                  <Text fontSize="sm" color="fg.subtle">
                    {group.items.length} 题 · 累计错 {group.totalOccurrences} 次
                  </Text>
                </Flex>
                <Box
                  flex="1" mx={4} h="6px" bg="bg.muted" borderRadius="full" overflow="hidden"
                  maxW="200px"
                >
                  <Box
                    h="100%" bg="status.danger.solid"
                    w={`${Math.min(100, group.totalOccurrences * 5)}%`}
                  />
                </Box>
              </Flex>
              <Stack gap={0}>
                {group.items.slice(0, 8).map((r) => (
                  <Flex
                    key={r.id} px={3} py={2} gap={3} align="center"
                    borderBottomWidth="1px" borderColor="border.subtle"
                    _hover={{ bg: 'bg.surfaceSubtle' }}
                    opacity={r.mastered ? 0.5 : 1}
                  >
                    <Text flex="1" fontSize="sm" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">
                      {r.questionStem}
                    </Text>
                    <Badge colorPalette="neutral" variant="subtle">
                      {SUBJECT_LABELS[r.subject] ?? r.subject}
                    </Badge>
                    <Text fontFamily="mono" fontSize="sm" minW="40px" textAlign="right">
                      ×{r.occurrences}
                    </Text>
                    {r.mastered ? (
                      <Badge colorPalette="success" variant="subtle">已掌握</Badge>
                    ) : (
                      <Button size="xs" variant="ghost" onClick={() => onMastered(r.id)}>标记掌握</Button>
                    )}
                  </Flex>
                ))}
                {group.items.length > 8 && (
                  <Text fontSize="xs" color="fg.subtle" p={2} textAlign="center">
                    +{group.items.length - 8} 更多…切到平铺视图查看完整列表
                  </Text>
                )}
              </Stack>
            </Box>
          ))}
        </Stack>
      ) : (
        <Table size="md">
          <Thead>
            <Tr>
              <Th>题目</Th>
              <Th>学科</Th>
              <Th>知识点</Th>
              <Th>次数</Th>
              <Th>最近</Th>
              <Th></Th>
            </Tr>
          </Thead>
          <Tbody>
            {filtered.map((r) => (
              <Tr key={r.id} opacity={r.mastered ? 0.5 : 1} _hover={{ bg: 'bg.surfaceSubtle' }}>
                <Td maxW="380px" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">{r.questionStem}</Td>
                <Td color="fg.subtle" fontSize="sm">{SUBJECT_LABELS[r.subject] ?? r.subject}</Td>
                <Td>
                  <Flex gap={1} wrap="wrap">
                    {(r.knowledgeTags ?? []).map((t) => <Badge key={t} bg="bg.muted" color="fg.muted">{t}</Badge>)}
                  </Flex>
                </Td>
                <Td fontFamily="mono" fontWeight={500}>{r.occurrences}</Td>
                <Td color="fg.subtle" fontSize="sm" fontFamily="mono">{new Date(r.lastSeenAt).toLocaleDateString('zh-CN')}</Td>
                <Td>
                  {r.mastered
                    ? <Badge bg="status.success.bg" color="status.success.fg">已掌握</Badge>
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
