# Accuracy Fixtures

Per checklist §六.1 / §七.1 / §八.1-3: each subject needs **≥ 20 real exam or answer-sheet images** plus hand-labeled `expected.json` files.

These fixtures are NOT committed to the repo. Collect them locally and place under:

```
fixtures/
  math/
    0001.jpg            # image
    0001.json           # expected[] — see schema below
    0002.jpg
    0002.json
    ...
  english/
  chinese/
  physics/
  chemistry/
```

## `expected.json` schema (per image)

```json
[
  {
    "no": "1",
    "type": "multiple_choice",
    "correctAnswer": "B",
    "maxScore": 5,
    "knowledgeTags": ["函数", "二次方程"]
  },
  {
    "no": "2",
    "type": "fill_in_blank",
    "correctAnswer": "1/2",
    "maxScore": 4,
    "knowledgeTags": ["分数运算"]
  }
]
```

`type` values must match `@teacher-score/types` `QuestionType`:
`multiple_choice` / `fill_in_blank` / `short_answer` / `essay` / `calculation` / `reading_comprehension`.

## Running accuracy

```bash
# math only
pnpm tsx scripts/accuracy-test.ts --subject math

# all subjects
pnpm tsx scripts/accuracy-test.ts --subject all

# capture/refresh baseline (only after manually validating the run)
pnpm tsx scripts/accuracy-test.ts --subject math --update-baseline
```

Baselines are written to `baselines/<subject>.json` and committed. Regression > 5% (§六.5 / §七.3) blocks publish.

## Coverage targets

Each subject's fixture should cover:

- 数学 (math): 选择 / 填空 / 计算 / 字迹不清样例
- 英语 (english): 选择 / 填空 / 阅读 / 作文（主观建议分）
- 语文 (chinese): 古诗默写 / 阅读题 / 作文
- 物理 (physics): 单位 / 公式 / 有效数字 / 计算
- 化学 (chemistry): 方程式配平 / 上下标 / 实验题
