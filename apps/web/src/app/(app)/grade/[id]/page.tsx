'use client';

import { use, useEffect, useState } from 'react';
import {
  Alert,
  AlertIcon,
  Badge,
  Box,
  Button,
  Flex,
  Heading,
  Input,
  Progress,
  Stack,
  Stat,
  StatGroup,
  StatLabel,
  StatNumber,
  Text,
  Textarea,
  useToast,
} from '@chakra-ui/react';
import { apiClient } from '@/lib/api-client';

interface QuestionResult {
  no: string;
  type: string;
  stem: string;
  studentAnswer: string;
  correctAnswer: string | null;
  isCorrect: boolean;
  score: number;
  maxScore: number;
  comment: string;
  confidence: 'low' | 'medium' | 'high';
  teacherModified?: boolean;
}

interface GradingRecord {
  id: string;
  status: 'pending' | 'queued' | 'recognizing' | 'scoring' | 'finalizing' | 'completed' | 'failed';
  progress?: string;
  subject: string;
  totalScore: number | null;
  maxScore: number | null;
  overallComment: string | null;
  results: QuestionResult[] | null;
  errorCode: string | null;
  errorMessage: string | null;
  retryable: boolean | null;
}

const STATUS_TEXT: Record<string, string> = {
  pending: '排队中',
  queued: '排队中',
  recognizing: '识别题目中…',
  scoring: 'LLM 批改中…',
  finalizing: '完成整理…',
  completed: '已完成',
  failed: '失败',
};

export default function GradeStatusPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const toast = useToast();
  const [record, setRecord] = useState<GradingRecord | null>(null);
  const [overdue, setOverdue] = useState(false);

  useEffect(() => {
    let active = true;
    const started = Date.now();
    const tick = async () => {
      const res = await apiClient.get<GradingRecord>(`/api/grade/${id}`);
      if (!active) return;
      if (res.ok) {
        const g = (res.data as unknown as { grading?: GradingRecord }).grading ?? (res.data as GradingRecord);
        setRecord(g);
        if (g.status === 'completed' || g.status === 'failed') return;
      }
      if (Date.now() - started > 90_000) setOverdue(true);
      if (active) setTimeout(tick, 3000);
    };
    tick();
    return () => {
      active = false;
    };
  }, [id]);

  if (!record) {
    return (
      <Stack>
        <Heading size="md">批改中…</Heading>
        <Progress isIndeterminate />
      </Stack>
    );
  }

  if (record.status === 'failed') {
    return (
      <Stack spacing={4}>
        <Heading size="md">批改失败</Heading>
        <Alert status="error">
          <AlertIcon />
          {record.errorMessage ?? record.errorCode ?? '未知错误'}
        </Alert>
        {record.retryable && (
          <Button
            colorScheme="brand"
            onClick={async () => {
              const res = await apiClient.post(`/api/grade/${id}/retry`);
              if (res.ok) toast({ status: 'info', title: '已重新入队' });
              else toast({ status: 'error', title: '重试失败' });
            }}
          >
            重试
          </Button>
        )}
      </Stack>
    );
  }

  if (record.status !== 'completed') {
    return (
      <Stack spacing={4}>
        <Heading size="md">{STATUS_TEXT[record.status] ?? record.status}</Heading>
        <Progress isIndeterminate colorScheme="brand" />
        {overdue && (
          <Alert status="info">
            <AlertIcon />
            仍在处理中，可稍后刷新页面。
          </Alert>
        )}
      </Stack>
    );
  }

  return <ResultView record={record} reload={() => apiClient.get(`/api/grade/${id}`)} />;
}

function ResultView({ record, reload }: { record: GradingRecord; reload: () => void }) {
  const toast = useToast();
  const [results, setResults] = useState<QuestionResult[]>(record.results ?? []);
  const total = results.reduce((acc, q) => acc + (Number(q.score) || 0), 0);
  const max = results.reduce((acc, q) => acc + (Number(q.maxScore) || 0), 0);
  const wrong = results.filter((q) => !q.isCorrect).length;

  const onOverride = async (no: string, score: number, comment?: string) => {
    const res = await apiClient.post(`/api/grade/${record.id}/override`, {
      questionNo: no,
      score,
      comment,
    });
    if (res.ok) {
      toast({ status: 'success', title: `第 ${no} 题已更新` });
      reload();
    } else toast({ status: 'error', title: '保存失败' });
  };

  return (
    <Stack spacing={4}>
      <Flex align="center" gap={2} flexWrap="wrap">
        <Heading size="lg">批改结果</Heading>
        <Box flex="1" />
        <Button
          size="sm"
          onClick={async () => {
            const name = window.prompt('为该模板起个名字：');
            if (!name) return;
            const res = await apiClient.post('/api/templates', {
              name,
              subject: record.subject,
              fromGradingId: record.id,
            });
            if (res.ok) toast({ status: 'success', title: '已保存为模板' });
            else toast({ status: 'error', title: '保存失败' });
          }}
        >
          保存为模板
        </Button>
        <Button
          size="sm"
          onClick={async () => {
            const res = await apiClient.post(`/api/pdf/grading/${record.id}`);
            if (res.ok) toast({ status: 'info', title: 'PDF 生成已入队' });
            else toast({ status: 'error', title: '入队失败' });
          }}
        >
          导出 PDF
        </Button>
        <Button
          size="sm"
          onClick={async () => {
            const res = await apiClient.post<{ url: string }>(
              `/api/share/create/grading/${record.id}`,
            );
            if (res.ok) {
              try {
                await navigator.clipboard.writeText(res.data.url);
                toast({ status: 'success', title: '分享链接已复制（7 天有效）' });
              } catch {
                window.prompt('复制下方链接（7 天有效）：', res.data.url);
              }
            } else {
              toast({
                status: 'error',
                title: '生成失败',
                description:
                  res.error.error === 'share_disabled' ? '未配置 SHARE_LINK_SECRET' : res.error.message,
              });
            }
          }}
        >
          家长分享链接
        </Button>
        <Badge colorScheme="green">已完成</Badge>
      </Flex>

      <Box bg="white" p={4} rounded="md" borderWidth="1px">
        <StatGroup>
          <Stat>
            <StatLabel>总分</StatLabel>
            <StatNumber>
              {total} / {max}
            </StatNumber>
          </Stat>
          <Stat>
            <StatLabel>正确率</StatLabel>
            <StatNumber>{max ? Math.round((total / max) * 100) : 0}%</StatNumber>
          </Stat>
          <Stat>
            <StatLabel>错题数</StatLabel>
            <StatNumber>{wrong}</StatNumber>
          </Stat>
        </StatGroup>
        {record.overallComment && (
          <Text mt={3} color="gray.700" fontSize="sm">
            评语：{record.overallComment}
          </Text>
        )}
      </Box>

      <Stack spacing={3}>
        {results.map((q, idx) => (
          <Box key={q.no} bg="white" p={4} rounded="md" borderWidth="1px">
            <Flex align="center" mb={2}>
              <Heading size="sm">第 {q.no} 题</Heading>
              <Badge ml={2} colorScheme={q.isCorrect ? 'green' : 'red'}>
                {q.isCorrect ? '正确' : '错误'}
              </Badge>
              <Badge
                ml={2}
                colorScheme={
                  q.confidence === 'high' ? 'green' : q.confidence === 'medium' ? 'yellow' : 'orange'
                }
              >
                信心 {q.confidence}
              </Badge>
              {q.teacherModified && (
                <Badge ml={2} colorScheme="purple">
                  老师改分
                </Badge>
              )}
            </Flex>
            <Text fontSize="sm" color="gray.700" mb={1}>
              题干：{q.stem}
            </Text>
            <Text fontSize="sm" mb={1}>
              学生答：{q.studentAnswer || '（空）'}
            </Text>
            <Text fontSize="sm" mb={1}>
              参考答：{q.correctAnswer ?? '-'}
            </Text>
            <Flex gap={2} align="center" mt={2}>
              <Input
                size="sm"
                w="80px"
                defaultValue={q.score}
                type="number"
                onBlur={(e) => {
                  const s = Number(e.target.value);
                  if (s !== q.score) onOverride(q.no, s, q.comment);
                }}
              />
              <Text fontSize="sm" color="gray.500">
                / {q.maxScore}
              </Text>
              <Textarea
                size="sm"
                placeholder="评语"
                defaultValue={q.comment}
                rows={1}
                onBlur={(e) => {
                  if (e.target.value !== q.comment) onOverride(q.no, q.score, e.target.value);
                }}
              />
            </Flex>
          </Box>
        ))}
      </Stack>
    </Stack>
  );
}
