'use client';

/**
 * 批量批改 · 选模板 + 选班级 + 给每个学生上传一张答题卡 → 一次入队 N 个 job
 */
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Alert, Badge, Box, Button, Flex, FormControl, FormLabel, HStack, Input,
  Select, Stack, Text, useToast,
} from '@/components/ui';
import { apiClient } from '@/lib/api-client';
import { PageHeader } from '@/components/page-header';

interface Sheet { id: string; name: string; subject: string; layout: unknown | null }
interface Klass { id: string; name: string; studentIds: string[] }
interface Student { id: string; name: string; grade: string | null }

interface Assignment {
  studentId: string;
  studentName: string;
  imageKey?: string;
  imageName?: string;
  status: 'pending' | 'uploading' | 'ready' | 'error';
  errorMsg?: string;
}

export default function BatchGradePage() {
  const router = useRouter();
  const toast = useToast();

  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [classes, setClasses] = useState<Klass[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [sheetId, setSheetId] = useState('');
  const [classId, setClassId] = useState('');
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    apiClient.get<{ templates: Sheet[] }>('/api/templates').then((r) => r.ok && setSheets(r.data.templates));
    apiClient.get<{ classes: Klass[] }>('/api/classes').then((r) => r.ok && setClasses(r.data.classes));
    apiClient.get<{ students: Student[] }>('/api/students').then((r) => r.ok && setStudents(r.data.students));
  }, []);

  // 选了班级 → 用班里学生预填 assignments
  useEffect(() => {
    if (!classId) { setAssignments([]); return; }
    const k = classes.find((c) => c.id === classId);
    if (!k) return;
    const stuById: Record<string, Student> = {};
    for (const s of students) stuById[s.id] = s;
    setAssignments(k.studentIds.map((sid) => ({
      studentId: sid,
      studentName: stuById[sid]?.name ?? sid.slice(-6),
      status: 'pending',
    })));
  }, [classId, classes, students]);

  const validSheets = useMemo(() => sheets.filter((s) => s.layout !== null), [sheets]);
  const readyCount = assignments.filter((a) => a.status === 'ready').length;
  const canSubmit = sheetId && classId && readyCount === assignments.length && assignments.length > 0;

  const uploadOne = async (idx: number, file: File) => {
    setAssignments((a) => a.map((x, i) => i === idx ? { ...x, status: 'uploading', imageName: file.name } : x));
    const form = new FormData();
    form.append('file', file);
    form.append('type', 'student-answer');
    const res = await fetch('/api/upload', { method: 'POST', body: form });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      setAssignments((a) => a.map((x, i) => i === idx
        ? { ...x, status: 'error', errorMsg: errText.slice(0, 100) }
        : x));
      return;
    }
    const data = await res.json();
    setAssignments((a) => a.map((x, i) => i === idx
      ? { ...x, status: 'ready', imageKey: data.key }
      : x));
  };

  // 批量自动分配：用户一次拖 N 张图，按 assignments 顺序分给前 N 个学生
  const onBulkFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const arr = Array.from(files);
    const targets = assignments
      .map((a, i) => ({ a, i }))
      .filter(({ a }) => a.status === 'pending');
    arr.slice(0, targets.length).forEach((file, k) => {
      uploadOne(targets[k]!.i, file);
    });
    if (arr.length > targets.length) {
      toast({ status: 'warning', title: `多了 ${arr.length - targets.length} 张图（学生不够）` });
    }
  };

  const onSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    const res = await apiClient.post<{ runId: string; count: number }>('/api/grade/batch', {
      examPaperId: sheetId,
      classId,
      assignments: assignments.map((a) => ({ studentId: a.studentId, imageKey: a.imageKey! })),
    });
    setSubmitting(false);
    if (res.ok) {
      toast({ status: 'success', title: `已入队 ${res.data.count} 个批改任务` });
      router.push(`/grading-runs/${res.data.runId}`);
    } else {
      toast({ status: 'error', title: '提交失败', description: res.error.message });
    }
  };

  return (
    <Stack gap={6}>
      <Flex justify="space-between" align="flex-start" flexWrap="wrap" gap={4}>
        <PageHeader
          eyebrow="批量"
          title="班级批改"
          description="选答题卡 + 选班级 + 每位学生一张图 → 一次入队，系统并发批改。"
        />
        <Button asChild variant="ghost" size="sm"><Link href="/grade">← 单张批改</Link></Button>
      </Flex>

      {/* Step 1: 模板 + 班级 */}
      <Box borderWidth="1px" borderColor="border.default" borderRadius="md" p={4} bg="bg.surface">
        <Flex gap={4} flexWrap="wrap">
          <FormControl flex="1" minW="280px" required>
            <FormLabel fontSize="sm">答题卡（仅显示带 layout 的）</FormLabel>
            <Select value={sheetId} onChange={(e) => setSheetId(e.target.value)}>
              <option value="">— 选答题卡 —</option>
              {validSheets.map((s) => <option key={s.id} value={s.id}>{s.name}（{s.subject}）</option>)}
            </Select>
          </FormControl>
          <FormControl flex="1" minW="280px" required>
            <FormLabel fontSize="sm">班级</FormLabel>
            <Select value={classId} onChange={(e) => setClassId(e.target.value)}>
              <option value="">— 选班级 —</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}（{c.studentIds.length} 人）</option>)}
            </Select>
          </FormControl>
        </Flex>
      </Box>

      {/* Step 2: 学生 × 图片 */}
      {assignments.length > 0 && (
        <Box borderWidth="1px" borderColor="border.default" borderRadius="md" p={4} bg="bg.surface">
          <Flex justify="space-between" align="center" mb={3} flexWrap="wrap" gap={2}>
            <Text fontSize="xs" color="fg.subtle" fontFamily="mono" textTransform="uppercase" letterSpacing="0.08em">
              学生分配（{readyCount}/{assignments.length} 就绪）
            </Text>
            <Box>
              <Input
                type="file" multiple accept="image/*"
                onChange={(e) => onBulkFiles(e.target.files)}
                size="sm" maxW="300px"
              />
              <Text fontSize="xs" color="fg.subtle" mt={1}>
                一次选多张图，按学生顺序自动分配
              </Text>
            </Box>
          </Flex>
          <Stack gap={2}>
            {assignments.map((a, idx) => (
              <Flex
                key={a.studentId}
                gap={3} align="center"
                p={2}
                borderWidth="1px" borderColor="border.default" borderRadius="sm"
                bg={a.status === 'ready' ? 'bg.surfaceSubtle' : 'bg.surface'}
              >
                <Text minW="160px" fontWeight={500}>{a.studentName}</Text>
                <Box flex="1">
                  {a.status === 'ready' ? (
                    <Text fontSize="sm" color="fg.subtle" fontFamily="mono">{a.imageName}</Text>
                  ) : a.status === 'uploading' ? (
                    <Text fontSize="sm" color="fg.subtle">上传中… {a.imageName}</Text>
                  ) : a.status === 'error' ? (
                    <Text fontSize="sm" color="status.danger.fg">✗ {a.errorMsg}</Text>
                  ) : (
                    <Input
                      type="file" accept="image/*" size="sm"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) uploadOne(idx, f);
                      }}
                    />
                  )}
                </Box>
                <Badge
                  colorPalette={
                    a.status === 'ready' ? 'success' :
                    a.status === 'error' ? 'danger' :
                    a.status === 'uploading' ? 'warning' : 'neutral'
                  }
                  variant="subtle"
                >
                  {a.status}
                </Badge>
              </Flex>
            ))}
          </Stack>
        </Box>
      )}

      {/* Step 3: 提交 */}
      <Box position="sticky" bottom="0" bg="bg.canvas" pt={3} borderTopWidth="1px" borderColor="border.default">
        <HStack justify="flex-end" gap={3}>
          {!canSubmit && (
            <Text fontSize="sm" color="fg.subtle">
              {!sheetId ? '请选答题卡' :
               !classId ? '请选班级' :
               assignments.length === 0 ? '该班无学生' :
               `还有 ${assignments.length - readyCount} 个学生未上传`}
            </Text>
          )}
          <Button
            colorPalette="primary"
            disabled={!canSubmit}
            loading={submitting}
            onClick={onSubmit}
          >
            提交批改 ({readyCount})
          </Button>
        </HStack>
      </Box>
    </Stack>
  );
}
