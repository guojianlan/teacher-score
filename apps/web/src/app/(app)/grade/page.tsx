'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box, Button, FormControl, FormLabel, Image, Select, Stack, Text, useToast,
} from '@chakra-ui/react';
import { apiClient } from '@/lib/api-client';
import { PageHeader } from '@/components/page-header';
import { SUBJECTS } from '@teacher-score/types';
import { Uploader } from './_uploader';
import { CameraCapture } from './_camera';
import { MobileQrCapture } from './_mobile-qr';

const SUBJECT_LABELS: Record<string, string> = {
  math: '数学', english: '英语', chinese: '语文', physics: '物理', chemistry: '化学',
};

interface Student { id: string; name: string; grade: string | null; subjects: string[]; }

export default function GradePage() {
  const router = useRouter();
  const toast = useToast();
  const [students, setStudents] = useState<Student[]>([]);
  const [templates, setTemplates] = useState<Array<{ id: string; name: string }>>([]);
  const [studentId, setStudentId] = useState('');
  const [subject, setSubject] = useState<string>('math');
  const [examPaperId, setExamPaperId] = useState('');
  const [imageKeys, setImageKeys] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    apiClient.get<{ students: Student[] }>('/api/students').then((res) => {
      if (res.ok) setStudents(res.data.students);
    });
  }, []);

  useEffect(() => {
    apiClient.get<{ templates: Array<{ id: string; name: string }> }>(`/api/templates?subject=${subject}`).then((res) => {
      if (res.ok) setTemplates(res.data.templates);
    });
    setExamPaperId('');
  }, [subject]);

  const onSubmit = async () => {
    if (!studentId) return toast({ status: 'warning', title: '请选择学生' });
    if (imageKeys.length === 0) return toast({ status: 'warning', title: '请先上传或拍照' });
    setSubmitting(true);
    const res = await apiClient.post<{ gradingId: string }>('/api/grade', {
      studentId, subject, imageKeys,
      ...(examPaperId ? { examPaperId } : {}),
    });
    setSubmitting(false);
    if (res.ok) router.push(`/grade/${res.data.gradingId}`);
    else toast({
      status: 'error',
      title: '提交失败',
      description: res.error.error === 'quota_exceeded' ? '本月配额已达上限' : res.error.message,
    });
  };

  return (
    <Stack spacing={10}>
      <PageHeader
        eyebrow="新批改"
        title="开始批改"
        description="选学生 → 选学科 → 上传答卷照片 → 提交。整个过程通常不到 30 秒。"
      />

      <Stack spacing={8}>
        <Section number="01" title="学生 / 学科">
          <Stack spacing={4} direction={['column', 'row']}>
            <FormControl isRequired flex="1">
              <FormLabel fontSize="sm" color="ink.700" mb={1.5}>学生</FormLabel>
              <Select value={studentId} onChange={(e) => setStudentId(e.target.value)} size="md">
                <option value="">请选择</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} {s.grade ? `· ${s.grade}` : ''}</option>
                ))}
              </Select>
            </FormControl>
            <FormControl isRequired flex="1">
              <FormLabel fontSize="sm" color="ink.700" mb={1.5}>学科</FormLabel>
              <Select value={subject} onChange={(e) => setSubject(e.target.value)} size="md">
                {SUBJECTS.map((s) => <option key={s} value={s}>{SUBJECT_LABELS[s]}</option>)}
              </Select>
            </FormControl>
          </Stack>

          {templates.length > 0 && (
            <FormControl mt={4}>
              <FormLabel fontSize="sm" color="ink.700" mb={1.5}>
                试卷模板 <Text as="span" color="ink.500" fontSize="xs">/ 可选，复用时跳过题目识别</Text>
              </FormLabel>
              <Select value={examPaperId} onChange={(e) => setExamPaperId(e.target.value)} size="md">
                <option value="">不使用模板</option>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
            </FormControl>
          )}
        </Section>

        <Section number="02" title="上传答卷">
          <Stack spacing={4}>
            <Uploader onUploaded={(key) => setImageKeys((prev) => [...prev, key])} />
            <Stack direction={['column', 'row']} spacing={3}>
              <CameraCapture onCaptured={(key) => setImageKeys((prev) => [...prev, key])} />
              <MobileQrCapture onCaptured={(key) => setImageKeys((prev) => [...prev, key])} />
            </Stack>

            {imageKeys.length > 0 && (
              <Box pt={2}>
                <Text fontFamily="mono" fontSize="xs" color="ink.500" letterSpacing="0.06em" mb={3}>
                  已上传 {imageKeys.length} 张
                </Text>
                <Stack direction="row" spacing={3} wrap="wrap">
                  {imageKeys.map((k) => (
                    <Box key={k} borderWidth="1px" borderColor="ink.100" borderRadius="6px" overflow="hidden" maxW="100px">
                      <Image src={`/api/upload/${encodeURIComponent(k)}`} alt="preview" />
                    </Box>
                  ))}
                </Stack>
              </Box>
            )}
          </Stack>
        </Section>

        <Box pt={4} borderTop="1px solid" borderColor="ink.100">
          <Button onClick={onSubmit} isLoading={submitting} size="lg">
            开始批改 →
          </Button>
          <Text mt={3} fontSize="xs" color="ink.500" fontFamily="mono">
            提交后会进入处理状态页，3 秒轮询一次。完成后自动跳到结果页。
          </Text>
        </Box>
      </Stack>
    </Stack>
  );
}

function Section({ number, title, children }: { number: string; title: string; children: React.ReactNode }) {
  return (
    <Box>
      <Box mb={5} pb={3} borderBottom="1px solid" borderColor="ink.100">
        <Text fontFamily="mono" fontSize="xs" color="ink.500" letterSpacing="0.08em" textTransform="uppercase" mb={1}>
          Step {number}
        </Text>
        <Text fontSize="lg" fontWeight={500}>{title}</Text>
      </Box>
      {children}
    </Box>
  );
}
