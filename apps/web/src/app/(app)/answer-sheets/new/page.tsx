'use client';

/**
 * 答题卡设计器 · 表单式录入
 *
 * 三层嵌套：Sheet → Question → SubQuestion → Blank
 * 顶部基本信息 + 题目列表（每题独立卡片可展开 / 折叠）
 *
 * 设计目标：老师对照标答 PDF 快速录入，键盘流畅，少点击。
 * 详见 docs/claude/ROADMAP-2026-W20.md §2。
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Badge, Box, Button, Flex, FormControl, FormLabel, HStack, IconButton, Input,
  Select, Stack, Text, Textarea, useToast,
} from '@/components/ui';
import { apiClient } from '@/lib/api-client';
import { PageHeader } from '@/components/page-header';
import type {
  AnswerSheet, ScoringMode, SheetBlank, SheetLayoutSpec,
  SheetQuestion, SheetSubQuestion,
} from '@teacher-score/types';
import { SCORING_MODES } from '@teacher-score/types';

const SUBJECT_OPTIONS = [
  { value: 'biology', label: '生物' },        // 注意：当前 SUBJECTS 没 biology，先 fallback 到 chinese
  { value: 'math', label: '数学' },
  { value: 'english', label: '英语' },
  { value: 'chinese', label: '语文' },
  { value: 'physics', label: '物理' },
  { value: 'chemistry', label: '化学' },
] as const;

type SubjectValue = (typeof SUBJECT_OPTIONS)[number]['value'];

const SCORING_LABELS: Record<ScoringMode, string> = {
  exact: '字面一致',
  keyword: '关键词命中',
  concept: '概念等价(LLM)',
};

// ─── 工厂函数 ───────────────────────────────────────────
function newBlank(no: string): SheetBlank {
  return { no, expected: '', maxScore: 1, scoringMode: 'exact' };
}
function newSubQuestion(no: string): SheetSubQuestion {
  return { no, blanks: [newBlank('1')] };
}
function newMcq(no: string): SheetQuestion {
  return {
    no,
    type: 'mcq',
    maxScore: 3,
    options: ['A', 'B', 'C', 'D'],
    correctOption: 'A',
  };
}
function newStructured(no: string): SheetQuestion {
  return {
    no,
    type: 'structured',
    maxScore: 10,
    subQuestions: [newSubQuestion('(1)')],
  };
}

// ─── 顶层 ────────────────────────────────────────────────
type Draft = Omit<AnswerSheet, 'id' | 'organizationId' | 'createdAt' | 'updatedAt'>;

const initialDraft: Draft = {
  name: '',
  subject: 'biology' as never,
  grade: '',
  totalScore: 100,
  questions: [],
  layout: { mcqColumns: 3, pageSize: 'A4', headerFields: ['name', 'examId'] },
};

export default function AnswerSheetDesignerPage() {
  const router = useRouter();
  const toast = useToast();
  const [draft, setDraft] = useState<Draft>(initialDraft);
  const [saving, setSaving] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());

  const update = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const updateLayout = (patch: Partial<SheetLayoutSpec>) =>
    setDraft((d) => ({ ...d, layout: { ...d.layout, ...patch } }));

  const addQuestion = (kind: 'mcq' | 'structured') => {
    const nextNo = String(draft.questions.length + 1);
    const q = kind === 'mcq' ? newMcq(nextNo) : newStructured(nextNo);
    setDraft((d) => ({ ...d, questions: [...d.questions, q] }));
  };
  const removeQuestion = (idx: number) => {
    if (!confirm('删除这道题？')) return;
    setDraft((d) => ({ ...d, questions: d.questions.filter((_, i) => i !== idx) }));
  };
  const updateQuestion = (idx: number, patch: Partial<SheetQuestion>) => {
    setDraft((d) => ({
      ...d,
      questions: d.questions.map((q, i) => (i === idx ? { ...q, ...patch } : q)),
    }));
  };
  const toggleCollapse = (idx: number) => {
    setCollapsed((s) => {
      const next = new Set(s);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  // ─── 子问 / 空操作 ────────────────────────────────────
  const addSubQuestion = (qIdx: number) => {
    const q = draft.questions[qIdx];
    if (!q || q.type !== 'structured') return;
    const subs = q.subQuestions ?? [];
    const nextNo = `(${subs.length + 1})`;
    updateQuestion(qIdx, { subQuestions: [...subs, newSubQuestion(nextNo)] });
  };
  const updateSubQuestion = (qIdx: number, sIdx: number, patch: Partial<SheetSubQuestion>) => {
    const q = draft.questions[qIdx];
    if (!q?.subQuestions) return;
    const next = q.subQuestions.map((s, i) => (i === sIdx ? { ...s, ...patch } : s));
    updateQuestion(qIdx, { subQuestions: next });
  };
  const removeSubQuestion = (qIdx: number, sIdx: number) => {
    const q = draft.questions[qIdx];
    if (!q?.subQuestions) return;
    updateQuestion(qIdx, { subQuestions: q.subQuestions.filter((_, i) => i !== sIdx) });
  };
  const addBlank = (qIdx: number, sIdx: number) => {
    const sub = draft.questions[qIdx]?.subQuestions?.[sIdx];
    if (!sub) return;
    updateSubQuestion(qIdx, sIdx, {
      blanks: [...sub.blanks, newBlank(String(sub.blanks.length + 1))],
    });
  };
  const updateBlank = (qIdx: number, sIdx: number, bIdx: number, patch: Partial<SheetBlank>) => {
    const sub = draft.questions[qIdx]?.subQuestions?.[sIdx];
    if (!sub) return;
    updateSubQuestion(qIdx, sIdx, {
      blanks: sub.blanks.map((b, i) => (i === bIdx ? { ...b, ...patch } : b)),
    });
  };
  const removeBlank = (qIdx: number, sIdx: number, bIdx: number) => {
    const sub = draft.questions[qIdx]?.subQuestions?.[sIdx];
    if (!sub || sub.blanks.length <= 1) return;
    updateSubQuestion(qIdx, sIdx, { blanks: sub.blanks.filter((_, i) => i !== bIdx) });
  };

  // ─── 校验 & 保存 ───────────────────────────────────────
  const validate = (): string | null => {
    if (!draft.name.trim()) return '请填名称';
    if (draft.questions.length === 0) return '至少加一道题';
    let calc = 0;
    for (const q of draft.questions) {
      if (q.type === 'mcq') {
        if (!q.correctOption) return `第 ${q.no} 题：MCQ 未指定正确选项`;
        calc += q.maxScore;
      } else {
        if (!q.subQuestions?.length) return `第 ${q.no} 题：结构化题至少要一个子问`;
        for (const s of q.subQuestions) {
          for (const b of s.blanks) {
            if (!b.expected.trim()) return `${q.no}${s.no} 第 ${b.no} 空：未填标答`;
          }
        }
        calc += q.maxScore;
      }
    }
    if (calc !== draft.totalScore) {
      const ok = confirm(`总分不匹配：题目合计 ${calc} 分 vs 设定 ${draft.totalScore} 分。继续保存？`);
      if (!ok) return '总分不匹配';
    }
    return null;
  };

  const onSave = async () => {
    const err = validate();
    if (err) { toast({ status: 'warning', title: err }); return; }
    setSaving(true);
    const res = await apiClient.post('/api/templates', {
      name: draft.name,
      subject: draft.subject,
      grade: draft.grade || undefined,
      totalScore: draft.totalScore,
      questions: draft.questions,
      layout: draft.layout,
    });
    setSaving(false);
    if (res.ok) {
      toast({ status: 'success', title: '已保存' });
      router.push('/answer-sheets');
    } else {
      toast({ status: 'error', title: '保存失败', description: res.error.message });
    }
  };

  // ─── 题目卡 ────────────────────────────────────────────
  const renderQuestion = (q: SheetQuestion, idx: number) => {
    const isCollapsed = collapsed.has(idx);
    return (
      <Box
        key={idx}
        borderWidth="1px"
        borderColor="border.default"
        borderRadius="md"
        bg="bg.surface"
        overflow="hidden"
      >
        {/* 头部 */}
        <Flex
          px={4} py={3} bg="bg.surfaceSubtle" align="center" gap={3}
          cursor="pointer" onClick={() => toggleCollapse(idx)}
        >
          <Text fontFamily="mono" fontWeight={600} minW="40px">Q{q.no}</Text>
          <Badge colorPalette={q.type === 'mcq' ? 'primary' : 'neutral'} variant="subtle">
            {q.type === 'mcq' ? 'MCQ' : '结构化'}
          </Badge>
          <Text fontFamily="mono" color="fg.subtle">{q.maxScore} 分</Text>
          {q.type === 'mcq' && (
            <Text fontFamily="mono" color="fg.subtle">正确：{q.correctOption}</Text>
          )}
          {q.type === 'structured' && (
            <Text fontFamily="mono" color="fg.subtle">
              {q.subQuestions?.length ?? 0} 子问 ·{' '}
              {q.subQuestions?.reduce((s, sq) => s + sq.blanks.length, 0) ?? 0} 空
            </Text>
          )}
          <Box flex="1" />
          <Text fontSize="xs" color="fg.subtle">{isCollapsed ? '▶' : '▼'}</Text>
          <Button
            size="xs" variant="ghost" colorPalette="danger"
            onClick={(e) => { e.stopPropagation(); removeQuestion(idx); }}
          >
            删除
          </Button>
        </Flex>

        {/* 题号 / 类型 / 分值 / 知识点 公共字段 */}
        {!isCollapsed && (
          <Stack gap={4} p={4}>
            <Flex gap={3} flexWrap="wrap">
              <FormControl maxW="100px">
                <FormLabel fontSize="xs" color="fg.subtle">题号</FormLabel>
                <Input
                  size="sm"
                  value={q.no}
                  onChange={(e) => updateQuestion(idx, { no: e.target.value })}
                />
              </FormControl>
              <FormControl maxW="140px">
                <FormLabel fontSize="xs" color="fg.subtle">类型</FormLabel>
                <Select
                  size="sm"
                  value={q.type}
                  onChange={(e) => {
                    const newType = e.target.value as 'mcq' | 'structured';
                    if (newType === q.type) return;
                    const fresh = newType === 'mcq' ? newMcq(q.no) : newStructured(q.no);
                    updateQuestion(idx, fresh);
                  }}
                >
                  <option value="mcq">MCQ 单选</option>
                  <option value="structured">结构化大题</option>
                </Select>
              </FormControl>
              <FormControl maxW="100px">
                <FormLabel fontSize="xs" color="fg.subtle">满分</FormLabel>
                <Input
                  size="sm" type="number" min={1}
                  value={q.maxScore}
                  onChange={(e) => updateQuestion(idx, { maxScore: Number(e.target.value) || 0 })}
                />
              </FormControl>
              <FormControl flex="1" minW="200px">
                <FormLabel fontSize="xs" color="fg.subtle">知识点（逗号分隔，可选）</FormLabel>
                <Input
                  size="sm"
                  placeholder="光合作用, 光反应"
                  value={(q.knowledgeTags ?? []).join(', ')}
                  onChange={(e) =>
                    updateQuestion(idx, {
                      knowledgeTags: e.target.value.split(/[,，]\s*/).filter(Boolean),
                    })
                  }
                />
              </FormControl>
            </Flex>

            {/* MCQ 专属字段 */}
            {q.type === 'mcq' && (
              <Flex gap={3} flexWrap="wrap">
                <FormControl maxW="200px">
                  <FormLabel fontSize="xs" color="fg.subtle">选项（逗号分隔）</FormLabel>
                  <Input
                    size="sm"
                    value={(q.options ?? []).join(',')}
                    onChange={(e) => updateQuestion(idx, {
                      options: e.target.value.split(/[,，]\s*/).map((s) => s.trim()).filter(Boolean),
                    })}
                  />
                </FormControl>
                <FormControl maxW="140px">
                  <FormLabel fontSize="xs" color="fg.subtle">正确选项</FormLabel>
                  <Select
                    size="sm"
                    value={q.correctOption ?? ''}
                    onChange={(e) => updateQuestion(idx, { correctOption: e.target.value })}
                  >
                    {(q.options ?? []).map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </Select>
                </FormControl>
              </Flex>
            )}

            {/* 结构化大题：子问 + 空 */}
            {q.type === 'structured' && (
              <Stack gap={3} mt={2}>
                {(q.subQuestions ?? []).map((sub, sIdx) => (
                  <Box
                    key={sIdx}
                    borderWidth="1px" borderColor="border.default" borderRadius="md"
                    p={3} bg="bg.surfaceSubtle"
                  >
                    <Flex gap={3} mb={3} align="center" flexWrap="wrap">
                      <FormControl maxW="100px">
                        <FormLabel fontSize="xs" color="fg.subtle">子问号</FormLabel>
                        <Input
                          size="sm"
                          value={sub.no}
                          onChange={(e) => updateSubQuestion(idx, sIdx, { no: e.target.value })}
                        />
                      </FormControl>
                      <FormControl flex="1" minW="240px">
                        <FormLabel fontSize="xs" color="fg.subtle">题面（可选，给 LLM 上下文）</FormLabel>
                        <Input
                          size="sm"
                          placeholder="光合作用过程中，PGA 的作用是…"
                          value={sub.prompt ?? ''}
                          onChange={(e) => updateSubQuestion(idx, sIdx, { prompt: e.target.value })}
                        />
                      </FormControl>
                      <Button
                        size="xs" variant="ghost" colorPalette="danger"
                        onClick={() => removeSubQuestion(idx, sIdx)}
                      >
                        删除子问
                      </Button>
                    </Flex>

                    {/* 空 */}
                    <Stack gap={2}>
                      {sub.blanks.map((blank, bIdx) => (
                        <Flex
                          key={bIdx}
                          gap={2}
                          align="flex-end"
                          p={2}
                          borderRadius="sm"
                          bg="bg.surface"
                        >
                          <FormControl maxW="60px">
                            <FormLabel fontSize="2xs" color="fg.subtle">空 #</FormLabel>
                            <Input
                              size="sm"
                              value={blank.no}
                              onChange={(e) => updateBlank(idx, sIdx, bIdx, { no: e.target.value })}
                            />
                          </FormControl>
                          <FormControl flex="2" minW="200px">
                            <FormLabel fontSize="2xs" color="fg.subtle">标准答案 *</FormLabel>
                            <Input
                              size="sm"
                              value={blank.expected}
                              placeholder="PGA"
                              onChange={(e) => updateBlank(idx, sIdx, bIdx, { expected: e.target.value })}
                            />
                          </FormControl>
                          <FormControl flex="2" minW="180px">
                            <FormLabel fontSize="2xs" color="fg.subtle">等价答案（逗号）</FormLabel>
                            <Input
                              size="sm"
                              placeholder="3-磷酸甘油酸, 甘油三磷酸"
                              value={(blank.alternateAcceptable ?? []).join(', ')}
                              onChange={(e) => updateBlank(idx, sIdx, bIdx, {
                                alternateAcceptable: e.target.value.split(/[,，]\s*/).filter(Boolean),
                              })}
                            />
                          </FormControl>
                          <FormControl maxW="80px">
                            <FormLabel fontSize="2xs" color="fg.subtle">分值</FormLabel>
                            <Input
                              size="sm" type="number" min={0.5} step={0.5}
                              value={blank.maxScore}
                              onChange={(e) => updateBlank(idx, sIdx, bIdx, {
                                maxScore: Number(e.target.value) || 0,
                              })}
                            />
                          </FormControl>
                          <FormControl maxW="140px">
                            <FormLabel fontSize="2xs" color="fg.subtle">评分模式</FormLabel>
                            <Select
                              size="sm"
                              value={blank.scoringMode}
                              onChange={(e) => updateBlank(idx, sIdx, bIdx, {
                                scoringMode: e.target.value as ScoringMode,
                              })}
                            >
                              {SCORING_MODES.map((m) => (
                                <option key={m} value={m}>{SCORING_LABELS[m]}</option>
                              ))}
                            </Select>
                          </FormControl>
                          <Button
                            size="xs" variant="ghost" colorPalette="danger"
                            onClick={() => removeBlank(idx, sIdx, bIdx)}
                            disabled={sub.blanks.length <= 1}
                          >
                            ✕
                          </Button>
                        </Flex>
                      ))}
                      <Button
                        size="xs" variant="ghost"
                        onClick={() => addBlank(idx, sIdx)}
                      >
                        + 加一个空
                      </Button>
                    </Stack>
                  </Box>
                ))}
                <Button
                  size="sm" variant="outline"
                  onClick={() => addSubQuestion(idx)}
                >
                  + 加子问
                </Button>
              </Stack>
            )}
          </Stack>
        )}
      </Box>
    );
  };

  // 总分实时计算
  const calcScore = draft.questions.reduce((s, q) => s + q.maxScore, 0);

  return (
    <Stack gap={6} pb={20}>
      <Flex justify="space-between" align="flex-start" flexWrap="wrap" gap={4}>
        <PageHeader
          eyebrow="新建"
          title="答题卡设计器"
          description="录入题目结构和标答。同一份数据用于：导出 PDF · 合成测试 · 批改对照。"
        />
        <Button asChild variant="ghost" size="sm">
          <Link href="/answer-sheets">← 返回列表</Link>
        </Button>
      </Flex>

      {/* 基本信息 */}
      <Box borderWidth="1px" borderColor="border.default" borderRadius="md" p={4} bg="bg.surface">
        <Text fontSize="xs" color="fg.subtle" fontFamily="mono" mb={3} textTransform="uppercase" letterSpacing="0.08em">
          基本信息
        </Text>
        <Stack gap={4}>
          <Flex gap={3} flexWrap="wrap">
            <FormControl flex="2" minW="240px" required>
              <FormLabel fontSize="sm">名称</FormLabel>
              <Input
                value={draft.name}
                placeholder="2025 一模生物模拟卷"
                onChange={(e) => update({ name: e.target.value })}
              />
            </FormControl>
            <FormControl maxW="160px">
              <FormLabel fontSize="sm">学科</FormLabel>
              <Select
                value={draft.subject}
                onChange={(e) => update({ subject: e.target.value as never })}
              >
                {SUBJECT_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </Select>
            </FormControl>
            <FormControl maxW="140px">
              <FormLabel fontSize="sm">年级</FormLabel>
              <Input
                placeholder="高三"
                value={draft.grade ?? ''}
                onChange={(e) => update({ grade: e.target.value })}
              />
            </FormControl>
            <FormControl maxW="120px">
              <FormLabel fontSize="sm">总分</FormLabel>
              <Input
                type="number"
                value={draft.totalScore}
                onChange={(e) => update({ totalScore: Number(e.target.value) || 0 })}
              />
            </FormControl>
          </Flex>
          <Flex gap={3} flexWrap="wrap">
            <FormControl maxW="140px">
              <FormLabel fontSize="sm">MCQ 列数</FormLabel>
              <Select
                value={draft.layout.mcqColumns}
                onChange={(e) => updateLayout({ mcqColumns: Number(e.target.value) })}
              >
                {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
              </Select>
            </FormControl>
            <FormControl maxW="120px">
              <FormLabel fontSize="sm">纸张</FormLabel>
              <Select
                value={draft.layout.pageSize}
                onChange={(e) => updateLayout({ pageSize: e.target.value as 'A4' | 'A3' })}
              >
                <option value="A4">A4</option>
                <option value="A3">A3</option>
              </Select>
            </FormControl>
            <Box flex="1" />
            <HStack gap={2} alignSelf="center">
              <Text fontSize="sm" color="fg.subtle" fontFamily="mono">
                题目合计：{calcScore} / {draft.totalScore} 分
              </Text>
              {calcScore !== draft.totalScore && (
                <Badge colorPalette="warning" variant="subtle">分数不齐</Badge>
              )}
            </HStack>
          </Flex>
        </Stack>
      </Box>

      {/* 题目列表 */}
      <Box>
        <Text fontSize="xs" color="fg.subtle" fontFamily="mono" mb={3} textTransform="uppercase" letterSpacing="0.08em">
          题目（{draft.questions.length}）
        </Text>
        <Stack gap={3}>
          {draft.questions.map((q, i) => renderQuestion(q, i))}
        </Stack>
        <HStack gap={2} mt={4}>
          <Button size="sm" colorPalette="primary" variant="outline" onClick={() => addQuestion('mcq')}>
            + MCQ 题
          </Button>
          <Button size="sm" colorPalette="primary" variant="outline" onClick={() => addQuestion('structured')}>
            + 结构化大题
          </Button>
        </HStack>
      </Box>

      {/* 底部固定保存条 */}
      <Box
        position="fixed" bottom="0" left="0" right="0"
        bg="bg.surface" borderTopWidth="1px" borderColor="border.default"
        p={3} zIndex={10}
      >
        <Flex justify="flex-end" gap={3} maxW="1200px" mx="auto">
          <Button variant="outline" onClick={() => router.push('/answer-sheets')}>取消</Button>
          <Button colorPalette="primary" loading={saving} onClick={onSave}>保存答题卡</Button>
        </Flex>
      </Box>
    </Stack>
  );
}
