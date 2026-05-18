# Roadmap · 答题卡 schema 驱动一切（3 周冲刺）

> 起点：2026-05-18 (W20)
> 终点：2026-06-07 (W22 末)
> 目标：老师能用「答题卡设计器」录入试卷 → 导出 PDF 给学生打印 → 拍照批改回来 → 班级聚合结果

---

## 1. 核心洞察（升级版）

看了真实样本（2025 八省联考生物模拟卷）后定的：

**一份 schema 驱动 3 个产品**：

```
        ┌──────────────────────────────────────────┐
        │  Answer Sheet Schema (3 层嵌套)          │
        │  Question → SubQuestion → Blank          │
        │  + 布局信息（列数、空宽度、序号样式）     │
        └──────────────────────────────────────────┘
              │            │            │
              ↓            ↓            ↓
         ┌────────┐  ┌────────┐  ┌──────────┐
         │ PDF    │  │ 合成   │  │ LLM      │
         │ 生成器 │  │ 测试   │  │ 批改     │
         │ (老师  │  │ 答题卡 │  │ (schema  │
         │  打印) │  │ (开发自│  │  指导    │
         │        │  │  测)   │  │  精提取) │
         └────────┘  └────────┘  └──────────┘
```

**好处**：
- 老师录入 1 次 → 同份数据生成可印 PDF + 驱动批改 + 自测合成样本
- 自测的合成器复用 PDF 渲染逻辑，没有额外工程债
- 错题本能精确到 "Q16(2) 第 1 空 你写错了" 而不是 "Q16 你扣了 4 分"

---

## 2. Schema 设计（核心）

```ts
interface AnswerSheet {
  id: string;
  name: string;                   // "2025 一模生物模拟卷"
  subject: Subject;
  grade: string;
  totalScore: number;             // 100
  questions: Question[];
  layout: LayoutSpec;             // PDF / 合成 / 批改都用
}

interface Question {
  no: string;                     // "1", "16"
  type: 'mcq' | 'structured';
  maxScore: number;

  // MCQ 字段
  options?: string[];             // ['A','B','C','D']
  correctOption?: string;         // 'D'

  // 结构化大题
  subQuestions?: SubQuestion[];
}

interface SubQuestion {
  no: string;                     // "(1)", "(3)"
  prompt?: string;                // 题目本身（可选，仅用于辅助批改）
  blanks: Blank[];
}

interface Blank {
  no: string;                     // 子问内编号
  expected: string;               // 标准答案
  alternateAcceptable?: string[]; // 等价答案（"叶绿体、线粒体" ⇔ "线粒体和叶绿体"）
  keywords?: string[];            // 关键词命中给分
  maxScore: number;
  scoringMode: 'exact' | 'keyword' | 'concept';
}

interface LayoutSpec {
  mcqColumns: number;             // 选择题排几列（参考样本是 3）
  pageSize: 'A4' | 'A3';
  headerFields: ('name' | 'examId' | 'class' | 'date')[];
}
```

---

## 3. 三周分解

### Week 1（W20）— Schema + 设计器 + PDF

| 日 | 任务 | 验收 |
|---|---|---|
| D1 | Schema 定义 + DB migration（answer_sheets 表 + scoped）| drizzle generate / migrate 通 |
| D2-D3 | 设计器 UI：基本信息 + Q/SubQ/Blank 嵌套编辑器 | 能录入 ≥10 题（含 MCQ + 结构化）|
| D4 | PDF 渲染器（schema → A4 排版，参照样本风格）| 1 张 PDF 可下载、打印可用 |
| D5 | 自测：用设计器复刻样本生物卷 → 导 PDF 对比 | 视觉相似度 ≥ 80%，结构 100% 等价 |

### Week 2（W21）— 合成 + 批改 + 准确率

| 日 | 任务 | 验收 |
|---|---|---|
| D6 | SVG/PNG 合成器（schema + 随机"学生答"→ 模拟答完图）| 跑出 10 张合成答题卡 |
| D7 | Prompts 重写：用 schema 指导 LLM 精确按结构提取每个空 | 给定 schema + 合成图 → 输出每个 blank 的学生答案 |
| D8 | Per-blank 评分引擎：exact / keyword / concept 三种模式 | 单元测试覆盖 3 种模式 |
| D9-D10 | E2E 验 1（合成 + 真实样本扫描）+ prompts 调优 round 1 | 准确率 ≥ 80% 自评 |

### Week 3（W22）— 班级 + 批量 + 收尾

| 日 | 任务 | 验收 |
|---|---|---|
| D11 | classes 表 + `/classes` 页（CRUD 简单版） | 建班、加学生 |
| D12 | 批量上传 UI（选答题卡 + 选班 + 拖多图）| 一次起 30 个 job |
| D13 | 班级聚合页（学生 × 题 × 错题概览）| 30 学生表格、点开看详情 |
| D14 | E2E 验 2 + prompts 调优 round 2 | 准确率 ≥ 90% 自评 |
| D15 | 缓冲 + USER-GUIDE.md + 3 分钟 demo | 用户能照文档走通 |

---

## 4. 关键妥协（明确不做）

- **图像配准 / 答题卡布局识别**：LLM 直接读全图。准确率不够再加 CV。
- **MCQ OMR**（气泡检测）：LLM 视觉够用就先不上。
- **PDF 花式排版**：基础 A4 排版可印就行。
- **错题本 / 知识点热力图**：Phase 2（≥W23）
- **PDF 学生报告 / 家长分享**：Phase 3
- **多老师协作、班主任视角**：Phase 4

---

## 5. 决策记录

| 项 | 选择 | 理由 |
|---|---|---|
| Schema 嵌套层数 | 3 层（Q → SubQ → Blank）| 真实试卷的最小完备建模；错题本精度需要 |
| 设计器优先级 | W1 就做 | 一份 schema 喂 3 个出口，省 Phase 2 返工 |
| 合成测试 vs 真实样本 | 都用 | 合成大样本 + 真实小样本 = 顶 confidence |
| 时间预算 | 3 周 vs 原 2 周 | 用户接受为换"老师可自主造卡"的价值 |
| 学科 | 沿用 5 学科 | 不扩 |
