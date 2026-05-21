# 答题卡结构化识别升级执行计划

> 日期：2026-05-21  
> 目标：用答题卡 schema 控制结构，Python/OpenCV 控制定位、矫正、裁剪与选择题 OMR，视觉 LLM 控制填空题和应用题步骤分判断。

---

## 一、核心结论

当前不应继续依赖视觉 LLM 对整张答题卡自行找题、识别和判分。

推荐升级为混合 pipeline：

```text
答题卡 schema
  -> PDF 生成时记录每个题区坐标
  -> 学生上传拍照图
  -> Python/OpenCV 矫正、定位、裁剪
  -> 选择题用 OMR
  -> 填空题和应用题用视觉 LLM 按局部图批改
  -> 老师复核低置信度结果
```

最终分工：

| 模块 | 负责内容 |
|---|---|
| 答题卡 schema | 定义题目、答案、评分点、坐标区域 |
| PDF 生成器 | 生成可打印答题卡，并输出坐标布局 |
| Python/OpenCV | 透视矫正、去噪、定位、裁剪、选择题 OMR |
| 视觉 LLM | 手写识别、填空等价判断、应用题步骤分 |
| 老师审核页 | 低置信度复核、改分、确认结果 |

原则是：

```text
Python 保证 LLM 看对地方。
LLM 保证步骤分判断像老师。
```

---

## 二、为什么这样设计

### 2.1 选择题不优先交给 LLM

选择题是固定选项，最稳定的是 OMR：

```text
A ○  B ●  C ○  D ○
```

Python 可以计算每个圆圈内的黑色像素比例，并输出选项和置信度。

优势：

- 成本低。
- 速度快。
- 可解释。
- 不消耗 LLM token。
- 比 LLM 看整页更稳定。

但选择题也不能直接宣称 100%。需要处理：

- 学生涂得很浅。
- 擦除痕迹明显。
- 多选或半涂。
- 拍照模糊。
- 答题卡倾斜严重。

因此选择题结果也应该包含：

```ts
type McqOmrResult = {
  questionNo: string;
  selected?: string;
  confidence: number;
  needsReview: boolean;
  reason?: string;
};
```

策略：

```text
OMR confidence 高 -> 直接采用
OMR confidence 低 -> 标记老师复核，必要时 fallback 给视觉 LLM
```

### 2.2 填空题需要 LLM 判断等价性

填空题不能只靠 OCR 或字符串匹配。

例如标准答案：

```text
叶绿体、线粒体
```

学生答案：

```text
线粒体和叶绿体
```

这类答案需要判断语义等价、关键词是否齐全、顺序是否影响得分、错别字是否可接受。OCR 只能识别文字，不能稳定完成语义判分。

最终策略：

```text
裁剪 blank 小图
  -> 视觉 LLM 识别学生手写答案
  -> 视觉 LLM 或 scoring engine 判断是否得分
```

### 2.3 应用题和步骤分必须用 LLM

Python 不能理解步骤分。

例如：

```text
18.(2) 共 6 分：
1. 写出公式 F=ma，1 分
2. 正确代入 m 和 a，2 分
3. 计算结果正确，2 分
4. 单位正确，1 分
```

视觉 LLM 应逐条判断评分点，并给出证据：

```json
{
  "score": 5,
  "maxScore": 6,
  "rubricResults": [
    {
      "point": "写出公式 F=ma",
      "awarded": true,
      "score": 1,
      "evidence": "学生写了 F=ma"
    },
    {
      "point": "单位正确",
      "awarded": false,
      "score": 0,
      "evidence": "学生答案中没有单位"
    }
  ],
  "confidence": 0.86,
  "needsReview": false
}
```

关键不是“是否使用 LLM”，而是：

```text
必须使用 LLM，但必须让 LLM 只看正确的小区域。
```

---

## 三、答题卡 schema 升级方向

schema 需要从“题目结构”升级为“题目结构 + 布局坐标 + 评分细则”。

### 3.1 页面区域 Region

```ts
type Region = {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  unit: 'pt' | 'mm';
};
```

每个选择题选项、填空题空格、应用题小问都需要有坐标。

### 3.2 选择题 option 坐标

```ts
type McqOption = {
  label: 'A' | 'B' | 'C' | 'D';
  region: Region;
};
```

用途：

```text
裁剪 A/B/C/D 四个圆圈
  -> 计算黑色像素比例
  -> 判断学生选项
```

### 3.3 填空题 blank 坐标

```ts
type Blank = {
  id: string;
  no: string;
  expected: string;
  alternateAcceptable?: string[];
  keywords?: string[];
  maxScore: number;
  scoringMode: 'exact' | 'keyword' | 'concept';
  region: Region;
};
```

用途：

```text
裁剪这个 blank 区域
  -> 发给视觉 LLM
  -> 判断学生写了什么
  -> 对照 expected / keywords / concept 给分
```

### 3.4 应用题 rubric 评分点

```ts
type RubricPoint = {
  id: string;
  description: string;
  score: number;
  acceptableEvidence?: string[];
};

type SubQuestion = {
  no: string;
  prompt?: string;
  maxScore: number;
  region: Region;
  rubricPoints: RubricPoint[];
};
```

应用题不能只存最终答案，必须支持评分细则。第一版可以支持简单评分说明，第二版再升级为多个 rubric point。

---

## 四、PDF 答题卡设计要求

答题卡 PDF 不能只是好看，必须方便机器识别。

建议加入：

1. 四角定位点。
2. 每页二维码。
3. 固定页边距。
4. 每个题区固定坐标。
5. 选择题使用标准圆圈。
6. 填空题使用明确框线。
7. 应用题使用独立作答框。
8. 尽量避免一个小问跨页。

二维码内容示例：

```json
{
  "answerSheetId": "xxx",
  "version": 3,
  "page": 1
}
```

页面结构示例：

```text
●                                      ●
        答题卡：2026 生物模拟卷
        QR(answerSheetId, version, page)

姓名：________ 班级：________

一、选择题

1. A ○ B ○ C ○ D ○
2. A ○ B ○ C ○ D ○

二、填空题

16.(1) 第 1 空：
┌──────────────────────┐
│                      │
└──────────────────────┘

三、应用题

18.(2)
┌──────────────────────────────┐
│                              │
│                              │
│                              │
└──────────────────────────────┘

●                                      ●
```

---

## 五、执行计划

### Phase 1：schema 和 PDF 布局升级

目标：让系统知道每个题区在 PDF 上的位置。

任务：

1. 扩展 `AnswerSheet` schema。
2. 增加 `Region`。
3. 选择题 option 存坐标。
4. 填空题 blank 存坐标。
5. 应用题 subQuestion 存坐标。
6. PDF 渲染器生成答题卡时同步生成 layout map。
7. 保存答题卡时存下完整 schema + layout。

验收：

- 任意一张答题卡可以导出 PDF。
- 每个题区都有坐标。
- 可以生成 debug overlay，显示所有裁剪框。

### Phase 2：Python 图像预处理 CLI

目标：上传学生拍照图后，能矫正并裁剪题区。

任务：

1. 新建 Python 图像处理模块。
2. 使用 OpenCV 读取图片。
3. 识别四角定位点。
4. 做透视矫正。
5. 根据 schema region 裁剪题区。
6. 输出裁剪图片。
7. 输出 debug 图，画出所有裁剪区域。
8. 对选择题区域做 OMR。

建议先做成 CLI：

```bash
python scripts/process_answer_sheet.py \
  --image input.jpg \
  --schema answer-sheet.json \
  --out tmp/crops
```

输出：

```text
tmp/crops/
  page-1-corrected.png
  q1_A.png
  q1_B.png
  q1_C.png
  q1_D.png
  blank-16-1-1.png
  subq-18-2.png
  debug-overlay.png
  result.json
```

`result.json` 示例：

```json
{
  "mcq": [
    {
      "questionNo": "1",
      "selected": "B",
      "confidence": 0.96,
      "needsReview": false
    }
  ],
  "crops": [
    {
      "id": "blank-16-1-1",
      "type": "blank",
      "path": "tmp/crops/blank-16-1-1.png"
    },
    {
      "id": "subq-18-2",
      "type": "subQuestion",
      "path": "tmp/crops/subq-18-2.png"
    }
  ]
}
```

验收：

- 拍照歪斜后能矫正。
- 每个 blank 能裁剪出来。
- 每个应用题小问能裁剪出来。
- 选择题能输出选项和置信度。
- debug overlay 能让开发者快速看裁剪是否正确。

### Phase 3：LLM 局部批改 pipeline

目标：把裁剪后的小图发给 LLM，而不是整张图。

任务：

1. 改造 `packages/ai`。
2. 新增 `gradeBlankFromCrop`。
3. 新增 `gradeSubQuestionFromCrop`。
4. LLM 输入包含：
   - 裁剪图。
   - 题号。
   - 题干。
   - 标准答案。
   - 评分模式。
   - rubric points。
5. LLM 输出结构化 JSON。
6. Zod 校验输出。
7. 低置信度自动标记 `needsReview`。

填空题 prompt 方向：

```text
你只需要批改这个填空题区域。
题号：16.(1) 第 1 空
标准答案：叶绿体、线粒体
可接受答案：线粒体和叶绿体
评分模式：concept
满分：2

请识别学生手写答案，并判断是否得分。
```

应用题 prompt 方向：

```text
你只需要批改 18.(2) 这个小问。
满分 6 分。
评分点：
1. 写出公式 F=ma，1 分
2. 正确代入 m 和 a，2 分
3. 计算结果正确，2 分
4. 单位正确，1 分

请逐评分点判断是否命中，给出证据、得分和置信度。
```

验收：

- LLM 不再处理整张图。
- 每个 blank 独立评分。
- 每个 subQuestion 独立评分。
- 每个 rubric point 有命中结果和证据。
- 老师审核页能看到 LLM 为什么给这个分。

### Phase 4：worker 集成

目标：把 Python 裁剪和 LLM 批改接入现有批改任务。

新流程：

```text
gradeExamJobHandler
  -> 读取 grading record
  -> 读取 answerSheet schema
  -> 下载学生上传图
  -> 调 Python/OpenCV 处理
  -> 得到 MCQ 结果 + crops
  -> MCQ 直接评分
  -> blanks/subQuestions 发给 LLM
  -> 汇总总分
  -> 写入 grading result
```

验收：

- 老师上传一张答题卡照片。
- worker 自动完成：
  - 图片矫正。
  - 选择题 OMR。
  - 填空题 LLM 评分。
  - 应用题 LLM 步骤分。
- 前端结果页展示：
  - 每题得分。
  - 学生答案识别结果。
  - rubric 命中情况。
  - 置信度。
  - 是否需要复核。

### Phase 5：准确率与回归测试

目标：不要凭感觉判断准确率。

任务：

1. 建立 fixture 格式。
2. 每张 fixture 包含：
   - 原始拍照图。
   - answerSheet schema。
   - 标准批改结果。
3. 跑自动准确率报告。
4. 指标分开看：
   - 选择题准确率。
   - 填空题识别准确率。
   - 填空题给分准确率。
   - 应用题步骤点命中率。
   - 总分误差。
   - 低置信度召回率。

阶段性验收目标：

```text
选择题：>= 98%
填空题给分：>= 85%
应用题 rubric point：>= 80%
总分误差：平均 <= 5%
低置信度题必须能召回大部分错误
```

---

## 六、讨论详情与决策

### 决策 1：选择题是否继续用 LLM？

结论：不优先用 LLM。

原因：

- 选择题是视觉几何问题，不是语义问题。
- OMR 更便宜、更快、更稳定。
- LLM 可作为 fallback，但不是主路径。

最终策略：

```text
OMR confidence 高 -> 直接采用
OMR confidence 低 -> 标记老师复核，或 fallback 给视觉 LLM
```

### 决策 2：填空题是否纯 OCR？

结论：不纯 OCR。

原因：

- 中文手写 OCR 不稳定。
- 答案存在同义、倒序、简称、错别字容忍等问题。
- OCR 只能识别字，不能判断是否等价。

最终策略：

```text
裁剪 blank 小图
  -> 视觉 LLM 识别 + 语义判断
```

### 决策 3：应用题是否让 LLM 看整页？

结论：不让 LLM 看整页。

原因：

- 容易串题。
- 容易漏看。
- token 成本高。
- 错误难解释。
- 无法稳定对齐小问。

最终策略：

```text
每个 subQuestion 单独裁剪
  -> LLM 只批这个小问
  -> 按 rubric point 给步骤分
```

### 决策 4：Python 是否必须引入？

结论：建议引入 Python/OpenCV。

原因：

- 答题卡矫正、定位、OMR、裁剪属于传统 CV，非常适合 OpenCV。
- LLM 之前必须先把图像整理好，否则 prompt 再好也会不稳定。
- Python 生态成熟，便于快速调试 debug overlay。

建议第一版不要做复杂服务，先做 CLI，由 Node worker 调用：

```text
Node worker -> spawn Python CLI -> 读取 result.json -> 继续 LLM 批改
```

后续如果性能需要，再升级为 Python microservice。

### 决策 5：老师是否必须录入详细 rubric？

结论：应用题必须支持 rubric，但可以分阶段。

第一版：

```text
标准答案 + 总分 + 评分说明
```

第二版：

```text
多个 rubric point，每个 point 有分值
```

长期推荐：

```text
rubric point + 可接受证据 + 常见错误
```

因为步骤分的核心不是“最后答案对不对”，而是“每个得分点有没有出现”。

---

## 七、最小可行版本

建议先做技术验证，不直接大改完整 UI。

MVP 只支持：

1. 单页答题卡。
2. 选择题 10 道。
3. 填空题 3 个。
4. 应用题 1 道，包含 2 个小问。
5. 每个小问有 rubric。
6. Python 裁剪 + OMR。
7. LLM 批改填空和应用题。
8. 输出 debug report。

MVP 验收输出示例：

```text
选择题：
1 B 置信度 0.96
2 D 置信度 0.93

填空题：
16.(1) 学生写“线粒体和叶绿体”，得 2/2

应用题：
18.(1) 得 3/4
- 公式正确：1/1
- 代入正确：1/1
- 计算正确：1/1
- 单位缺失：0/1

总分：xx
需要老师复核：18.(2)，原因：字迹不清
```

---

## 八、推荐立即执行顺序

1. 选一张现有答题卡 schema。
2. 生成 PDF。
3. 手写并拍照一张样本。
4. 写 Python CLI 完成矫正、裁剪、OMR。
5. 把裁剪图喂给视觉 LLM。
6. 生成一份 HTML debug report。
7. 验证结果稳定后，再接入正式 worker 和前端。

这条路径风险最低，也最容易判断该方向是否真实提升准确率。
