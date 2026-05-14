'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Button,
  FormControl,
  FormLabel,
  Heading,
  Image,
  Select,
  Stack,
  Text,
  useToast,
} from '@chakra-ui/react';
import { apiClient } from '@/lib/api-client';
import { SUBJECTS } from '@teacher-score/types';
import { Uploader } from './_uploader';
import { CameraCapture } from './_camera';
import { MobileQrCapture } from './_mobile-qr';

const SUBJECT_LABELS: Record<string, string> = {
  math: '数学',
  english: '英语',
  chinese: '语文',
  physics: '物理',
  chemistry: '化学',
};

interface Student {
  id: string;
  name: string;
  grade: string | null;
  subjects: string[];
}

export default function GradePage() {
  const router = useRouter();
  const toast = useToast();
  const [students, setStudents] = useState<Student[]>([]);
  const [templates, setTemplates] = useState<Array<{ id: string; name: string; subject: string }>>([]);
  const [studentId, setStudentId] = useState('');
  const [subject, setSubject] = useState<string>('math');
  const [examPaperId, setExamPaperId] = useState<string>('');
  const [imageKeys, setImageKeys] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    apiClient.get<{ students: Student[] }>('/api/students').then((res) => {
      if (res.ok) setStudents(res.data.students);
    });
  }, []);

  useEffect(() => {
    apiClient
      .get<{ templates: Array<{ id: string; name: string; subject: string }> }>(
        `/api/templates?subject=${subject}`,
      )
      .then((res) => {
        if (res.ok) setTemplates(res.data.templates);
      });
    setExamPaperId('');
  }, [subject]);

  const onSubmit = async () => {
    if (!studentId) return toast({ status: 'warning', title: '请选择学生' });
    if (imageKeys.length === 0) return toast({ status: 'warning', title: '请先上传或拍照' });
    setSubmitting(true);
    const res = await apiClient.post<{ gradingId: string }>('/api/grade', {
      studentId,
      subject,
      imageKeys,
      ...(examPaperId ? { examPaperId } : {}),
    });
    setSubmitting(false);
    if (res.ok) {
      router.push(`/grade/${res.data.gradingId}`);
    } else {
      toast({
        status: 'error',
        title: '提交失败',
        description: res.error.error === 'quota_exceeded' ? '本月配额已达上限' : res.error.message,
      });
    }
  };

  return (
    <Stack spacing={6}>
      <Heading size="lg">批改</Heading>

      <Box bg="white" p={6} rounded="md" borderWidth="1px">
        <Stack spacing={4}>
          <FormControl isRequired>
            <FormLabel>学生</FormLabel>
            <Select value={studentId} onChange={(e) => setStudentId(e.target.value)}>
              <option value="">请选择</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} {s.grade ? `（${s.grade}）` : ''}
                </option>
              ))}
            </Select>
          </FormControl>

          <FormControl isRequired>
            <FormLabel>学科</FormLabel>
            <Select value={subject} onChange={(e) => setSubject(e.target.value)}>
              {SUBJECTS.map((s) => (
                <option key={s} value={s}>
                  {SUBJECT_LABELS[s]}
                </option>
              ))}
            </Select>
          </FormControl>

          {templates.length > 0 && (
            <FormControl>
              <FormLabel>试卷模板（可选，复用时跳过题目识别）</FormLabel>
              <Select value={examPaperId} onChange={(e) => setExamPaperId(e.target.value)}>
                <option value="">不使用模板</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </FormControl>
          )}

          <FormControl>
            <FormLabel>上传 / 拍照学生答卷</FormLabel>
            <Stack spacing={3}>
              <Uploader
                onUploaded={(key) => setImageKeys((prev) => [...prev, key])}
              />
              <CameraCapture
                onCaptured={(key) => setImageKeys((prev) => [...prev, key])}
              />
              <MobileQrCapture
                onCaptured={(key) => setImageKeys((prev) => [...prev, key])}
              />
              {imageKeys.length > 0 && (
                <Box>
                  <Text fontSize="sm" color="gray.600" mb={2}>
                    已上传 {imageKeys.length} 张
                  </Text>
                  <Stack direction="row" spacing={2} wrap="wrap">
                    {imageKeys.map((k) => (
                      <Box key={k} borderWidth="1px" rounded="md" overflow="hidden" maxW="120px">
                        <Image src={`/api/upload/${encodeURIComponent(k)}`} alt="preview" />
                      </Box>
                    ))}
                  </Stack>
                </Box>
              )}
            </Stack>
          </FormControl>

          <Button colorScheme="brand" size="lg" onClick={onSubmit} isLoading={submitting}>
            开始批改
          </Button>
        </Stack>
      </Box>
    </Stack>
  );
}
