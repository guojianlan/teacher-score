'use client';

import { use, useEffect, useState } from 'react';
import {
  Alert, AlertIcon, Badge, Box, Button, Flex, Heading, Input, Progress, Stack, Text, Textarea, useToast,
} from '@chakra-ui/react';
import { apiClient } from '@/lib/api-client';
import { PageHeader } from '@/components/page-header';

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
  pending: '排队中', queued: '排队中', recognizing: '识别题目', scoring: 'LLM 批改', finalizing: '整理结果',
  completed: '已完成', failed: '失败',
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
    return () => { active = false; };
  }, [id]);

  if (!record) {
    return (
      <Stack spacing={8}>
        <PageHeader eyebrow="处理中" title="正在批改" />
        <Progress isIndeterminate colorScheme="blue" size="xs" />
      </Stack>
    );
  }

  if (record.status === 'failed') {
    return (
      <Stack spacing={8}>
        <PageHeader eyebrow="错误" title="批改失败" />
        <Alert status="error" variant="left-accent" borderRadius="6px">
          <AlertIcon />
          {record.errorMessage ?? record.errorCode ?? '未知错误'}
        </Alert>
        {record.retryable && (
          <Box>
            <Button
              onClick={async () => {
                const res = await apiClient.post(`/api/grade/${id}/retry`);
                if (res.ok) toast({ status: 'info', title: '已重新入队' });
                else toast({ status: 'error', title: '重试失败' });
              }}
            >
              重试 ↻
            </Button>
          </Box>
        )}
      </Stack>
    );
  }

  if (record.status !== 'completed') {
    return (
      <Stack spacing={8}>
        <PageHeader
          eyebrow={STATUS_TEXT[record.status] ?? record.status}
          title="正在批改"
          description="多模态模型正在识别题目并判分。通常需要 10-30 秒。"
        />
        <Progress isIndeterminate colorScheme="blue" size="xs" />
        {overdue && (
          <Alert status="info" variant="left-accent" borderRadius="6px">
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
  const results = record.results ?? [];
  const total = results.reduce((acc, q) => acc + (Number(q.score) || 0), 0);
  const max = results.reduce((acc, q) => acc + (Number(q.maxScore) || 0), 0);
  const wrong = results.filter((q) => !q.isCorrect).length;
  const pct = max > 0 ? Math.round((total / max) * 100) : 0;

  const onOverride = async (no: string, score: number, comment?: string) => {
    const res = await apiClient.post(`/api/grade/${record.id}/override`, { questionNo: no, score, comment });
    if (res.ok) { toast({ status: 'success', title: `第 ${no} 题已更新` }); reload(); }
    else toast({ status: 'error', title: '保存失败' });
  };

  return (
    <Stack spacing={10}>
      <PageHeader
        eyebrow="批改完成 · 可一键改分"
        title="批改结果"
        actions={
          <Flex gap={2} wrap="wrap">
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                const name = window.prompt('为该模板起个名字：');
                if (!name) return;
                const res = await apiClient.post('/api/templates', { name, subject: record.subject, fromGradingId: record.id });
                if (res.ok) toast({ status: 'success', title: '已保存为模板' });
                else toast({ status: 'error', title: '保存失败' });
              }}
            >
              保存为模板
            </Button>
            <Button
              size="sm"
              variant="outline"
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
              variant="outline"
              onClick={async () => {
                const res = await apiClient.post<{ url: string }>(`/api/share/create/grading/${record.id}`);
                if (res.ok) {
                  try { await navigator.clipboard.writeText(res.data.url); toast({ status: 'success', title: '分享链接已复制' }); }
                  catch { window.prompt('复制下方链接（7 天有效）：', res.data.url); }
                } else toast({
                  status: 'error', title: '生成失败',
                  description: res.error.error === 'share_disabled' ? '未配置 SHARE_LINK_SECRET' : res.error.message,
                });
              }}
            >
              家长分享
            </Button>
          </Flex>
        }
      />

      {/* Score grid */}
      <Box borderTop="1px solid" borderBottom="1px solid" borderColor="border.default" py={6}>
        <Flex gap={[6, 12]} wrap="wrap">
          <Stat label="总分" main={
            <Flex align="baseline" gap={1}>
              <Text fontFamily="mono" fontSize="4xl" fontWeight={500}>{total}</Text>
              <Text fontFamily="mono" color="fg.subtle" fontSize="lg">/{max}</Text>
            </Flex>
          } />
          <Stat label="正确率" main={
            <Text fontFamily="mono" fontSize="4xl" fontWeight={500}>{pct}<Text as="span" fontSize="lg" color="fg.subtle">%</Text></Text>
          } />
          <Stat label="错题数" main={
            <Text fontFamily="mono" fontSize="4xl" fontWeight={500} color={wrong > 0 ? 'status.danger.fg' : 'text.fg'}>{wrong}</Text>
          } />
        </Flex>
        {record.overallComment && (
          <Text mt={6} pt={6} borderTop="1px solid" borderColor="border.default" color="fg.muted" fontSize="md" fontStyle="italic" lineHeight={1.65}>
            “{record.overallComment}”
          </Text>
        )}
      </Box>

      {/* Question by question */}
      <Stack spacing={0} borderTop="1px solid" borderColor="border.default">
        {results.map((q) => (
          <Box key={q.no} py={6} borderBottom="1px solid" borderColor="border.default">
            <Flex align="baseline" gap={3} mb={3} wrap="wrap">
              <Text fontFamily="mono" fontSize="sm" color="fg.subtle" w="32px">Q{q.no}</Text>
              <Badge bg={q.isCorrect ? 'status.success.bg' : 'status.danger.bg'} color={q.isCorrect ? 'status.success.fg' : 'status.danger.fg'}>
                {q.isCorrect ? '正确' : '错误'}
              </Badge>
              <Badge
                bg={q.confidence === 'high' ? 'bg.muted' : q.confidence === 'medium' ? 'status.warning.bg' : 'status.danger.bg'}
                color={q.confidence === 'high' ? 'fg.subtle' : q.confidence === 'medium' ? 'status.warning.fg' : 'status.danger.fg'}
              >
                信心 {q.confidence}
              </Badge>
              {q.teacherModified && <Badge bg="bg.brandSubtle" color="brand.800">老师改分</Badge>}
            </Flex>

            <Text fontSize="md" color="fg.muted" mb={2} lineHeight={1.6}>{q.stem}</Text>

            <Stack spacing={1.5} fontSize="sm" color="fg.subtle" mb={4}>
              <Flex gap={3}>
                <Text fontFamily="mono" w="60px" flexShrink={0} color="fg.subtle">学生</Text>
                <Text color="fg.muted">{q.studentAnswer || '（空）'}</Text>
              </Flex>
              <Flex gap={3}>
                <Text fontFamily="mono" w="60px" flexShrink={0} color="fg.subtle">参考</Text>
                <Text color="fg.muted">{q.correctAnswer ?? '—'}</Text>
              </Flex>
            </Stack>

            <Flex gap={3} align="center" wrap="wrap">
              <Text fontFamily="mono" fontSize="xs" color="fg.subtle" letterSpacing="0.06em">SCORE</Text>
              <Input
                size="sm"
                w="80px"
                defaultValue={q.score}
                type="number"
                fontFamily="mono"
                onBlur={(e) => { const s = Number(e.target.value); if (s !== q.score) onOverride(q.no, s, q.comment); }}
              />
              <Text fontFamily="mono" fontSize="sm" color="fg.subtle">/ {q.maxScore}</Text>
              <Textarea
                size="sm"
                placeholder="单题评语"
                defaultValue={q.comment}
                rows={1}
                flex="1"
                minH="36px"
                onBlur={(e) => { if (e.target.value !== q.comment) onOverride(q.no, q.score, e.target.value); }}
              />
            </Flex>
          </Box>
        ))}
      </Stack>
    </Stack>
  );
}

function Stat({ label, main }: { label: string; main: React.ReactNode }) {
  return (
    <Box>
      <Text fontFamily="mono" fontSize="xs" color="fg.subtle" letterSpacing="0.08em" textTransform="uppercase" mb={1}>
        {label}
      </Text>
      {main}
    </Box>
  );
}
