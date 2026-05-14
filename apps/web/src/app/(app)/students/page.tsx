'use client';

import { useEffect, useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Flex,
  Heading,
  Input,
  Select,
  Spinner,
  Stack,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  useDisclosure,
  useToast,
} from '@chakra-ui/react';
import { apiClient } from '@/lib/api-client';
import { SUBJECTS } from '@teacher-score/types';
import { StudentFormDrawer, type Student } from './_form';

const SUBJECT_LABELS: Record<string, string> = {
  math: '数学',
  english: '英语',
  chinese: '语文',
  physics: '物理',
  chemistry: '化学',
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

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, grade, subject]);

  const onDelete = async (id: string) => {
    if (!confirm('确认删除该学生？删除后历史批改记录保留。')) return;
    const res = await apiClient.delete(`/api/students/${id}`);
    if (res.ok) {
      toast({ status: 'success', title: '已删除' });
      refresh();
    } else toast({ status: 'error', title: '删除失败' });
  };

  return (
    <Stack spacing={4}>
      <Flex align="center">
        <Heading size="lg">学生</Heading>
        <Box flex="1" />
        <Button
          colorScheme="brand"
          onClick={() => {
            setEditing(null);
            drawer.onOpen();
          }}
        >
          + 新建学生
        </Button>
      </Flex>

      <Flex gap={3} bg="white" p={4} rounded="md" borderWidth="1px">
        <Input placeholder="搜索姓名" value={search} onChange={(e) => setSearch(e.target.value)} maxW="240px" />
        <Input placeholder="年级" value={grade} onChange={(e) => setGrade(e.target.value)} maxW="160px" />
        <Select value={subject} onChange={(e) => setSubject(e.target.value)} maxW="160px">
          <option value="">全部学科</option>
          {SUBJECTS.map((s) => (
            <option key={s} value={s}>
              {SUBJECT_LABELS[s]}
            </option>
          ))}
        </Select>
      </Flex>

      <Box bg="white" rounded="md" borderWidth="1px" overflow="hidden">
        {loading ? (
          <Flex p={8} justify="center">
            <Spinner />
          </Flex>
        ) : (
          <Table>
            <Thead bg="gray.50">
              <Tr>
                <Th>姓名</Th>
                <Th>年级</Th>
                <Th>学科</Th>
                <Th>备注</Th>
                <Th>操作</Th>
              </Tr>
            </Thead>
            <Tbody>
              {students.length === 0 ? (
                <Tr>
                  <Td colSpan={5}>
                    <Box py={6} textAlign="center" color="gray.500">
                      暂无学生
                    </Box>
                  </Td>
                </Tr>
              ) : (
                students.map((s) => (
                  <Tr key={s.id}>
                    <Td fontWeight="semibold">{s.name}</Td>
                    <Td>{s.grade ?? '-'}</Td>
                    <Td>
                      {(s.subjects ?? []).map((sub) => (
                        <Badge key={sub} mr={1} colorScheme="brand">
                          {SUBJECT_LABELS[sub] ?? sub}
                        </Badge>
                      ))}
                    </Td>
                    <Td maxW="240px" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">
                      {s.notes ?? '-'}
                    </Td>
                    <Td>
                      <Button
                        size="xs"
                        mr={2}
                        onClick={() => {
                          setEditing(s);
                          drawer.onOpen();
                        }}
                      >
                        编辑
                      </Button>
                      <Button size="xs" colorScheme="red" variant="ghost" onClick={() => onDelete(s.id)}>
                        删除
                      </Button>
                    </Td>
                  </Tr>
                ))
              )}
            </Tbody>
          </Table>
        )}
      </Box>

      <StudentFormDrawer
        isOpen={drawer.isOpen}
        onClose={() => {
          drawer.onClose();
          setEditing(null);
        }}
        editing={editing}
        onSaved={() => {
          drawer.onClose();
          setEditing(null);
          refresh();
        }}
      />
    </Stack>
  );
}
