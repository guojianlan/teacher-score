/**
 * 家长分享页 · 公开（无需登录）
 *
 * URL: /share/grading/[id]?o=<orgId>&exp=<unix>&sig=<hmac>
 * 后端 /api/share/grading/[id] 校验签名 + 返回学情数据（学生姓名脱敏 → [学生]）
 *
 * 链接 7 天有效，过期或签名无效 → 显示错误页
 */
'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Badge, Box, Container, Flex, Heading, Stack, Text } from '@chakra-ui/react';

interface ShareData {
  subject: string;
  totalScore: number | null;
  maxScore: number | null;
  overallComment: string | null;
  results: Array<{
    no: string; stem: string;
    studentAnswer: string; correctAnswer: string | null;
    isCorrect: boolean; score: number; maxScore: number;
    comment: string; knowledgeTags?: string[];
  }> | null;
  completedAt: string | null;
}

interface ErrorResp { error: string }

const SUBJECT_LABELS: Record<string, string> = {
  math: '数学', english: '英语', chinese: '语文',
  physics: '物理', chemistry: '化学', biology: '生物',
};

export default function ShareGradingPage() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const id = params?.id;
  const o = search?.get('o') ?? '';
  const exp = search?.get('exp') ?? '';
  const sig = search?.get('sig') ?? '';

  const [data, setData] = useState<ShareData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id || !o || !exp || !sig) {
      setError('链接缺少参数');
      return;
    }
    const url = `/api/share/grading/${id}?o=${encodeURIComponent(o)}&exp=${exp}&sig=${sig}`;
    fetch(url)
      .then(async (res) => {
        if (res.ok) {
          setData(await res.json());
        } else {
          const e = (await res.json().catch(() => ({}))) as ErrorResp;
          setError(
            e.error === 'link_expired' ? '链接已过期（7 天有效）' :
            e.error === 'bad_signature' ? '链接已损坏或被篡改' :
            e.error === 'not_found' ? '找不到该批改记录' :
            (e.error ?? '加载失败')
          );
        }
      })
      .catch((err) => setError(err.message));
  }, [id, o, exp, sig]);

  if (error) {
    return (
      <Container maxW="md" py={20}>
        <Stack gap={4} textAlign="center">
          <Heading size="lg">✗</Heading>
          <Text fontSize="lg" color="red.600">{error}</Text>
          <Text color="gray.500" fontSize="sm">如有疑问，请联系老师。</Text>
        </Stack>
      </Container>
    );
  }

  if (!data) {
    return (
      <Container maxW="md" py={20}>
        <Text color="gray.500" textAlign="center">载入中…</Text>
      </Container>
    );
  }

  const subjectZh = SUBJECT_LABELS[data.subject] ?? data.subject;
  const total = data.totalScore ?? 0;
  const max = data.maxScore ?? 100;
  const pct = max > 0 ? Math.round((total / max) * 100) : 0;
  const wrong = (data.results ?? []).filter((q) => !q.isCorrect);

  return (
    <Container maxW="3xl" py={10} px={[4, 8]}>
      <Stack gap={8}>
        {/* 顶部 */}
        <Box textAlign="center">
          <Text fontSize="xs" color="gray.500" mb={2} letterSpacing="0.1em" textTransform="uppercase">
            学情报告 · 家长版
          </Text>
          <Heading size="lg">[学生] · {subjectZh}</Heading>
          {data.completedAt && (
            <Text color="gray.500" fontSize="sm" mt={2}>
              {new Date(data.completedAt).toLocaleString('zh-CN')}
            </Text>
          )}
        </Box>

        {/* 总分卡片 */}
        <Flex
          justify="space-around" align="center"
          p={6}
          borderWidth="1px" borderColor="gray.200" borderRadius="lg"
          bg="gray.50"
          gap={6}
          flexWrap="wrap"
        >
          <Box textAlign="center">
            <Text fontSize="xs" color="gray.500" mb={1}>总分</Text>
            <Text fontSize="3xl" fontWeight={600}>{total} / {max}</Text>
          </Box>
          <Box textAlign="center">
            <Text fontSize="xs" color="gray.500" mb={1}>正确率</Text>
            <Text fontSize="3xl" fontWeight={600} color={pct >= 60 ? 'green.600' : 'red.600'}>
              {pct}%
            </Text>
          </Box>
          <Box textAlign="center">
            <Text fontSize="xs" color="gray.500" mb={1}>错题数</Text>
            <Text fontSize="3xl" fontWeight={600}>{wrong.length}</Text>
          </Box>
        </Flex>

        {/* 总评 */}
        {data.overallComment && (
          <Box p={4} bg="blue.50" borderRadius="md" borderLeft="3px solid" borderLeftColor="blue.400">
            <Text fontSize="sm" color="gray.700">{data.overallComment}</Text>
          </Box>
        )}

        {/* 错题清单 */}
        {wrong.length > 0 && (
          <Box>
            <Heading size="sm" mb={3}>错题（{wrong.length}）</Heading>
            <Stack gap={3}>
              {wrong.map((q) => (
                <Box
                  key={q.no}
                  borderWidth="1px" borderColor="gray.200" borderRadius="md"
                  p={4}
                >
                  <Flex justify="space-between" align="flex-start" mb={2} gap={3}>
                    <Text fontWeight={600}>第 {q.no} 题</Text>
                    <Badge colorPalette="red" variant="subtle">
                      {q.score} / {q.maxScore}
                    </Badge>
                  </Flex>
                  <Text fontSize="sm" color="gray.700" mb={2}>{q.stem}</Text>
                  <Text fontSize="sm" mb={1}>
                    <Text as="span" color="gray.500">学生答：</Text>
                    {q.studentAnswer || '（空）'}
                  </Text>
                  <Text fontSize="sm" mb={2}>
                    <Text as="span" color="gray.500">正确答：</Text>
                    {q.correctAnswer ?? '—'}
                  </Text>
                  {q.comment && (
                    <Text fontSize="xs" color="gray.500" mt={2} fontStyle="italic">{q.comment}</Text>
                  )}
                  {q.knowledgeTags && q.knowledgeTags.length > 0 && (
                    <Flex gap={1} mt={2} flexWrap="wrap">
                      {q.knowledgeTags.map((t) => (
                        <Badge key={t} colorPalette="gray" variant="subtle" fontSize="2xs">{t}</Badge>
                      ))}
                    </Flex>
                  )}
                </Box>
              ))}
            </Stack>
          </Box>
        )}

        {/* 底部声明 */}
        <Box
          mt={8} pt={6}
          borderTopWidth="1px" borderColor="gray.200"
          textAlign="center"
        >
          <Text fontSize="xs" color="gray.500">
            此页面由家长分享链接生成（7 天有效）。学生姓名已脱敏。
          </Text>
        </Box>
      </Stack>
    </Container>
  );
}
