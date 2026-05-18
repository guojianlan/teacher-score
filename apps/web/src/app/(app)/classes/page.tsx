'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Badge, Box, Button, Flex, FormControl, FormLabel, HStack, Input, Stack,
  Table, Tbody, Td, Text, Th, Thead, Tr, useToast,
} from '@/components/ui';
import { apiClient } from '@/lib/api-client';
import { PageHeader } from '@/components/page-header';

interface Klass {
  id: string;
  name: string;
  grade: string | null;
  studentIds: string[];
  createdAt: string;
}

interface Student {
  id: string;
  name: string;
  grade: string | null;
}

export default function ClassesPage() {
  const toast = useToast();
  const [classes, setClasses] = useState<Klass[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<{ name: string; grade: string; studentIds: string[] }>({
    name: '', grade: '', studentIds: [],
  });

  const studentById = useMemo(() => {
    const m: Record<string, Student> = {};
    for (const s of students) m[s.id] = s;
    return m;
  }, [students]);

  const refresh = async () => {
    const [c, s] = await Promise.all([
      apiClient.get<{ classes: Klass[] }>('/api/classes'),
      apiClient.get<{ students: Student[] }>('/api/students'),
    ]);
    if (c.ok) setClasses(c.data.classes);
    if (s.ok) setStudents(s.data.students);
  };
  useEffect(() => { refresh(); }, []);

  const onEdit = (k: Klass) => {
    setEditId(k.id);
    setForm({ name: k.name, grade: k.grade ?? '', studentIds: [...k.studentIds] });
  };
  const onCancel = () => { setEditId(null); setForm({ name: '', grade: '', studentIds: [] }); };

  const onSave = async () => {
    if (!form.name.trim()) return toast({ status: 'warning', title: '请填班级名' });
    const payload = {
      name: form.name.trim(),
      grade: form.grade.trim() || undefined,
      studentIds: form.studentIds,
    };
    const res = editId
      ? await apiClient.patch(`/api/classes/${editId}`, payload)
      : await apiClient.post('/api/classes', payload);
    if (res.ok) { toast({ status: 'success', title: editId ? '已更新' : '已创建' }); onCancel(); refresh(); }
    else toast({ status: 'error', title: '保存失败' });
  };

  const onDelete = async (id: string) => {
    if (!confirm('删除班级？已用它批改的记录保留。')) return;
    const res = await apiClient.delete(`/api/classes/${id}`);
    if (res.ok) { toast({ status: 'success', title: '已删除' }); refresh(); }
    else toast({ status: 'error', title: '删除失败' });
  };

  const toggleStudent = (sid: string) => {
    setForm((f) => ({
      ...f,
      studentIds: f.studentIds.includes(sid)
        ? f.studentIds.filter((x) => x !== sid)
        : [...f.studentIds, sid],
    }));
  };

  return (
    <Stack gap={8}>
      <PageHeader
        eyebrow={`${classes.length} 个班级`}
        title="班级"
        description="把学生分组成班级，便于批量分发答题卡 + 聚合查看每个班级的成绩。"
      />

      {/* 创建 / 编辑表单 */}
      <Box borderWidth="1px" borderColor="border.default" borderRadius="md" p={4} bg="bg.surface">
        <Text fontSize="xs" color="fg.subtle" fontFamily="mono" mb={3} textTransform="uppercase" letterSpacing="0.08em">
          {editId ? '编辑班级' : '新建班级'}
        </Text>
        <Stack gap={3}>
          <Flex gap={3} flexWrap="wrap">
            <FormControl flex="2" minW="240px" required>
              <FormLabel fontSize="sm">名称</FormLabel>
              <Input value={form.name} placeholder="初二 (3) 班"
                onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </FormControl>
            <FormControl maxW="160px">
              <FormLabel fontSize="sm">年级</FormLabel>
              <Input value={form.grade} placeholder="初二"
                onChange={(e) => setForm({ ...form, grade: e.target.value })} />
            </FormControl>
          </Flex>
          <Box>
            <Text fontSize="sm" mb={2}>学生（{form.studentIds.length} 已选 / 共 {students.length}）</Text>
            {students.length === 0 ? (
              <Text fontSize="sm" color="fg.subtle">还没有学生，请先到「学生」页面添加。</Text>
            ) : (
              <Flex gap={2} flexWrap="wrap">
                {students.map((s) => {
                  const on = form.studentIds.includes(s.id);
                  return (
                    <Button
                      key={s.id}
                      size="xs"
                      variant={on ? 'solid' : 'outline'}
                      colorPalette={on ? 'primary' : 'neutral'}
                      onClick={() => toggleStudent(s.id)}
                    >
                      {s.name}{s.grade ? ` · ${s.grade}` : ''}
                    </Button>
                  );
                })}
              </Flex>
            )}
          </Box>
          <HStack gap={2}>
            <Button colorPalette="primary" onClick={onSave}>{editId ? '保存修改' : '创建班级'}</Button>
            {editId && <Button variant="outline" onClick={onCancel}>取消</Button>}
          </HStack>
        </Stack>
      </Box>

      {/* 列表 */}
      {classes.length === 0 ? (
        <Box py={16} textAlign="center" borderTop="1px solid" borderBottom="1px solid" borderColor="border.default">
          <Text fontFamily="mono" color="fg.subtle" fontSize="sm" mb={2}>EMPTY</Text>
          <Text color="fg.subtle">还没有班级。在上方新建一个。</Text>
        </Box>
      ) : (
        <Table size="md">
          <Thead>
            <Tr>
              <Th>名称</Th><Th>年级</Th><Th>人数</Th><Th>成员</Th><Th>创建</Th><Th></Th>
            </Tr>
          </Thead>
          <Tbody>
            {classes.map((k) => (
              <Tr key={k.id} _hover={{ bg: 'bg.surfaceSubtle' }}>
                <Td fontWeight={500}>{k.name}</Td>
                <Td color="fg.subtle">{k.grade ?? '—'}</Td>
                <Td fontFamily="mono">{k.studentIds.length}</Td>
                <Td>
                  <Flex gap={1} flexWrap="wrap">
                    {k.studentIds.slice(0, 6).map((sid) => (
                      <Badge key={sid} colorPalette="neutral" variant="subtle">
                        {studentById[sid]?.name ?? sid.slice(-4)}
                      </Badge>
                    ))}
                    {k.studentIds.length > 6 && (
                      <Text fontSize="xs" color="fg.subtle">+{k.studentIds.length - 6}</Text>
                    )}
                  </Flex>
                </Td>
                <Td fontSize="sm" color="fg.subtle" fontFamily="mono">
                  {new Date(k.createdAt).toLocaleDateString('zh-CN')}
                </Td>
                <Td>
                  <HStack gap={1}>
                    <Button asChild size="xs" variant="ghost">
                      <a href={`/heatmap/class/${k.id}`}>热力图</a>
                    </Button>
                    <Button size="xs" variant="ghost" onClick={() => onEdit(k)}>编辑</Button>
                    <Button size="xs" variant="ghost" colorPalette="danger" onClick={() => onDelete(k.id)}>删除</Button>
                  </HStack>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}
    </Stack>
  );
}
