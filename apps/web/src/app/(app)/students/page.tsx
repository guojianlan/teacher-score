'use client';

import { useEffect, useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Flex,
  Input,
  Select,
  Spinner,
  Stack,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  useDisclosure,
  useToast,
} from '@chakra-ui/react';
import { apiClient } from '@/lib/api-client';
import { PageHeader } from '@/components/page-header';
import { SUBJECTS } from '@teacher-score/types';
import { StudentFormDrawer, type Student } from './_form';

const SUBJECT_LABELS: Record<string, string> = {
  math: '数学', english: '英语', chinese: '语文', physics: '物理', chemistry: '化学',
};

export default function StudentsPage() {
  const toast = useToast();
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [grade, setGrade] = useState('');
  const [subject, setSubject] = useState('');
  const [editing, setEditing] = useState<Student | null>(null);
  const drawer = useDisclosure();

  const refresh = async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (grade) params.set('grade', grade);
    if (subject) params.set('subject', subject);
    const res = await apiClient.get<{ students: Student[] }>(`/api/students?${params}`);
    if (res.ok) setStudents(res.data.students);
    else toast({ status: 'error', title: '加载失败' });
    setLoading(false);
  };

  useEffect(() => { refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [search, grade, subject]);

  const onDelete = async (id: string) => {
    if (!confirm('确认删除该学生？删除后历史批改记录保留。')) return;
    const res = await apiClient.delete(`/api/students/${id}`);
    if (res.ok) { toast({ status: 'success', title: '已删除' }); refresh(); }
    else toast({ status: 'error', title: '删除失败' });
  };

  return (
    <Stack spacing={8}>
      <PageHeader
        eyebrow={`花名册 · ${students.length} 人`}
        title="学生"
        description="一对一辅导的学生档案。学科和年级用于批改时筛选。"
        actions={
          <Button onClick={() => { setEditing(null); drawer.onOpen(); }} size="md">
            + 新建学生
          </Button>
        }
      />

      <Flex gap={3} wrap="wrap">
        <Input placeholder="搜索姓名" value={search} onChange={(e) => setSearch(e.target.value)} maxW="240px" size="md" />
        <Input placeholder="年级，如 初二" value={grade} onChange={(e) => setGrade(e.target.value)} maxW="180px" size="md" />
        <Select value={subject} onChange={(e) => setSubject(e.target.value)} maxW="160px" size="md">
          <option value="">全部学科</option>
          {SUBJECTS.map((s) => <option key={s} value={s}>{SUBJECT_LABELS[s]}</option>)}
        </Select>
      </Flex>

      <Box>
        {loading ? (
          <Flex p={12} justify="center"><Spinner color="text.fgSubtext" /></Flex>
        ) : students.length === 0 ? (
          <Box py={16} textAlign="center" borderTop="1px solid" borderBottom="1px solid" borderColor="border.base">
            <Text fontFamily="mono" color="text.fgSubtle" fontSize="sm" mb={2}>EMPTY</Text>
            <Text color="text.fgSubtle">还没有学生。点右上角「新建学生」开始。</Text>
          </Box>
        ) : (
          <Table size="md">
            <Thead>
              <Tr>
                <Th>姓名</Th>
                <Th>年级</Th>
                <Th>学科</Th>
                <Th>备注</Th>
                <Th isNumeric width="120px"></Th>
              </Tr>
            </Thead>
            <Tbody>
              {students.map((s) => (
                <Tr key={s.id} _hover={{ bg: 'bg.subtle' }} transition="background 100ms ease">
                  <Td fontWeight={500} fontSize="md">{s.name}</Td>
                  <Td color="text.fgSubtle">{s.grade ?? '—'}</Td>
                  <Td>
                    <Flex gap={1.5} wrap="wrap">
                      {(s.subjects ?? []).map((sub) => (
                        <Badge key={sub} bg="bg.muted" color="text.fgMuted">{SUBJECT_LABELS[sub] ?? sub}</Badge>
                      ))}
                    </Flex>
                  </Td>
                  <Td maxW="280px" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap" color="text.fgSubtle" fontSize="sm">
                    {s.notes ?? '—'}
                  </Td>
                  <Td isNumeric>
                    <Button size="xs" variant="ghost" mr={1} onClick={() => { setEditing(s); drawer.onOpen(); }}>
                      编辑
                    </Button>
                    <Button size="xs" variant="ghost" color="red.700" onClick={() => onDelete(s.id)}>
                      删除
                    </Button>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </Box>

      <StudentFormDrawer
        isOpen={drawer.isOpen}
        onClose={() => { drawer.onClose(); setEditing(null); }}
        editing={editing}
        onSaved={() => { drawer.onClose(); setEditing(null); refresh(); }}
      />
    </Stack>
  );
}
