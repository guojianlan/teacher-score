# Codex 开发计划草案 — 教师 LLM 批改 SaaS

> 日期：2026-05-13  
> 状态：Codex 草案，待 Claude Code 评审  
> 作者：Codex  
> 输入依据：`PRODUCT.md`、`REQUIREMENTS.md`、`FINAL_IMPLEMENTATION_DECISION.md`、`ARCHITECTURE.md`、`CODEX_CLAUDE_DISCUSSION_LOG.md`

---

## 一、计划定位

本文是 Codex 根据当前 `docs/claude` 文档整理出的第一版开发计划草案。

执行优先级：

1. `FINAL_IMPLEMENTATION_DECISION.md` 是最终执行约束。
2. `REQUIREMENTS.md` 和 `PRODUCT.md` 定义产品与需求范围。
3. `ARCHITECTURE.md` 是原始技术草案，若与最终执行版冲突，以最终执行版为准。
4. `CODEX_CLAUDE_DISCUSSION_LOG.md` 用于追溯架构讨论过程，不直接覆盖最终执行版。

本文不直接进入实施，需要先由 Claude Code 审阅、挑战和补充。Codex 与 Claude Code 达成一致后，再沉淀最终开发计划文档。

---

## 二、产品目标

构建面向一对一辅导老师的 LLM 批改 SaaS。

核心用户路径：

```text
注册 / 登录
  -> 自动创建 personal organization
  -> 创建学生
  -> 上传或拍摄答卷图片
  -> 创建 grading record
  -> pg-boss 入队
  -> worker 调用多模态 LLM 批改
  -> 前端轮询批改进度
  -> 老师审核结果、改分、添加评语
  -> 错题与学情数据沉淀
```

长期目标保留完整 5 科：

- 数学
- 英语
- 语文
- 物理
- 化学

但实施必须分阶段推进，每科上线前必须有 fixture 和准确率回归门槛。

---

## 三、最终架构原则

### 3.1 Monorepo 结构

最终采用：

```text
teacher-score-application/
├── apps/
│   ├── web/
│   └── backend/
├── packages/
│   ├── db/
│   ├── auth/
│   ├── ai/
│   ├── storage/
│   ├── jobs/
│   ├── pdf/
│   ├── logger/
│   ├── analytics/
│   ├── email/
│   ├── types/
│   └── config/
├── docs/
├── scripts/
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── ecosystem.config.js
```

### 3.2 apps/web 职责

`apps/web` 使用 Next.js 16，负责：

- 页面路由
- 登录 / 注册 UI
- Dashboard 与业务页面
- SSR / RSC / SSG / ISR / CSR 能力
- Chakra UI 组件与交互
- 浏览器端统一请求同域 `/api/*`
- 本地开发通过 Next rewrites 转发 `/api/*` 到 backend
- RSC / Server Components 调 backend API 时转发 Cookie

`apps/web` 不负责：

- 直接访问数据库
- 直接调用 LLM
- 消费 pg-boss 队列
- 承载 Better-Auth server handler
- 承载业务 REST API

### 3.3 apps/backend 职责

`apps/backend` 使用 Hono，包含两个启动入口：

```text
apps/backend/src/http.ts
apps/backend/src/worker.ts
```

`http.ts` 负责：

- 启动 Hono HTTP API
- Better-Auth server handler：`/api/auth/*`
- 业务 REST API：
  - `/api/students`
  - `/api/upload`
  - `/api/grade`
  - `/api/papers`
  - `/api/mistakes`
  - `/api/quotas`
  - `/api/health`
- session middleware
- require organization middleware
- quota middleware

`worker.ts` 负责：

- 启动 pg-boss consumer
- 注册 `grade-exam`、`generate-pdf`、`extract-template`、`cleanup-orphan-files` 等任务
- 管理 worker 进程生命周期
- SIGTERM / SIGINT 优雅退出

### 3.4 packages 职责

`packages/*` 只放可复用能力，不放独立进程生命周期。

推荐边界：

| 包 | 职责 |
|---|---|
| `packages/db` | Drizzle schema、migration、db client、`scopedDb` |
| `packages/auth` | Better-Auth 配置、client/server exports、hooks |
| `packages/ai` | OpenAI-compatible client、prompt、Zod schema、grader |
| `packages/storage` | local / Supabase Storage provider |
| `packages/jobs` | 纯 job handler，如 `gradeExamJobHandler` |
| `packages/pdf` | PDF 报告生成 |
| `packages/logger` | Pino logger、redact、Sentry bridge |
| `packages/analytics` | PostHog 封装 |
| `packages/email` | Resend / dev mail transport |
| `packages/types` | 跨包共享类型 |
| `packages/config` | TS / ESLint / Prettier 共享配置 |

---

## 四、不可违反的技术红线

### 4.1 多租户安全

租户边界是 `organization`，不是 user，也不是 teacher。

要求：

- 所有业务表必须包含 `organizationId`。
- 所有业务表必须为 `organizationId` 建 index。
- 业务查询必须走 `scopedDb(organizationId)` 或等价封装。
- worker job payload 必须包含 `gradingId` 和 `organizationId`。
- worker 查询 grading record 必须同时校验 `id` 和 `organizationId`。
- ESLint 禁止业务代码直接 import raw `db`。
- 多租户隔离必须有自动化测试。

### 4.2 Auth 边界

Better-Auth server handler 必须完整运行在 backend：

```text
apps/backend
  /api/auth/*
```

`apps/web` 只负责登录 / 注册 UI 和 auth client 调用。

本地开发：

```text
web      http://localhost:3000
backend  http://localhost:3001
```

浏览器统一访问：

```text
http://localhost:3000/api/*
```

由 Next.js rewrites 代理到 backend，避免跨端口 Cookie / CORS 问题。

### 4.3 批改进度

当前阶段不使用 Supabase Realtime。

采用轮询：

```text
POST /api/grade
  -> 返回 gradingId

GET /api/grade/:id/status
  -> 前端每 3 秒轮询
  -> completed / failed 后停止
  -> 90 秒未完成提示稍后刷新
```

### 4.4 存储与隐私

存储采用 provider 抽象：

- dev / test：local provider
- staging / production：默认 Supabase Storage

图片要求：

- 支持 jpg / png / webp / heic
- 单文件不超过 10MB
- 服务端 MIME 校验
- 使用 sharp 清理 EXIF / GPS 等元数据
- 文件 key 以 `organizationId` 开头

### 4.5 LLM 调用

AI 通过 OpenAI-compatible API 调用：

- `AI_BASE_URL`
- `AI_API_KEY`
- `AI_VISION_MODEL`

要求：

- 每科独立 prompt。
- 统一 Zod schema 校验输出。
- 每题必须输出 confidence。
- 字迹不清不能瞎判，必须低置信度标注。
- prompt 不传学生真实姓名，用 `[学生]` 占位。
- 每次调用记录 token、耗时、成本、模型、学科。

---

## 五、阶段计划

## 阶段 0：基础设施与端到端空链路

建议周期：3-4 周。

目标：先证明系统从登录到 worker 写回状态可以跑通。

### 5.1 主要任务

1. 初始化 pnpm monorepo。
2. 建立 Node 20.9+、TypeScript strict、ESLint、Prettier、Vitest、Playwright。
3. 创建 `apps/web`：
   - Next.js 16
   - Chakra UI
   - 根布局
   - 登录 / 注册页面
   - Dashboard shell
   - API client helper
   - server-side API helper
   - `/api/*` rewrites
4. 创建 `apps/backend`：
   - Hono app
   - `src/http.ts`
   - `src/worker.ts`
   - `src/boss.ts`
   - health route
   - session middleware
   - require-org middleware
   - quota middleware
5. 创建基础 packages：
   - `config`
   - `types`
   - `logger`
   - `db`
   - `auth`
   - `storage`
   - `jobs`
   - `ai`
   - `email`
6. 创建 Drizzle schema：
   - Better-Auth tables
   - organizations
   - members
   - invitations
   - students
   - exam_papers
   - grading_records
   - mistake_collection
   - monthly_quotas
7. `organizations` 表必须包含正式列：
   - `isPersonal`
   - `subscriptionTier`
   - `monthlyQuota`
8. 实现 Better-Auth 邮箱注册 / 登录 / 密码重置。
9. 注册后自动创建 personal organization。
10. 设置或补全 active organization。
11. 实现 `scopedDb(organizationId)`。
12. 实现 `no-raw-db` ESLint 规则。
13. 实现学生 CRUD：
   - 创建
   - 编辑
   - archived 软删除
   - 搜索
   - 筛选
   - 备注
14. 实现上传基础链路。
15. 实现 `POST /api/grade`：
   - 校验 session
   - 校验 quota
   - 创建 grading record
   - 入队 `grade-exam`
16. 实现 worker 测试 job：
   - pending -> processing -> completed
17. 实现 `GET /api/grade/:id/status`。
18. 建立多租户隔离测试。
19. 建立基础 CI。
20. 建立 PM2 三进程配置：
   - web
   - api
   - worker

### 5.2 上传链路草案

阶段 0 推荐统一走 backend 接收文件：

```text
browser
  -> POST /api/upload multipart
  -> backend MIME / size 校验
  -> sharp strip EXIF
  -> storage.upload(buffer, key)
  -> 返回 key
```

原因：

- dev local 和 prod Supabase 行为一致。
- EXIF 清洗责任点清晰。
- MIME / 大小限制更容易统一。
- 初期文件大小只有 10MB 以内，后端转发成本可接受。

后续如需要前端直传 signed URL，再单独设计 finalize / clean 流程。

### 5.3 配额表草案

`organization.monthlyQuota` 表示当前套餐的每月上限。

`monthly_quotas` 表记录每月实际用量：

```text
organizationId
yearMonth
gradingsUsed
tokensUsed
costCents
updatedAt
```

阶段 1 批改成功后扣减；阶段 0 可先在空 job 完成时模拟递增。

### 5.4 阶段 0 验收

- 新用户注册到 Dashboard 小于 60 秒。
- 注册后自动创建 personal organization。
- 可以创建、编辑、删除、搜索学生。
- 可以上传图片。
- 上传图片已完成服务端 MIME 校验和 EXIF 清洗。
- 可以创建 grading record。
- worker 能消费测试 job 并写回 completed。
- 前端可以通过轮询看到 completed。
- Org A 不能读取 Org B 数据。
- worker job 中 organizationId 不匹配时必须失败。
- `lint`、`test`、`build` 通过。

---

## 阶段 1：数学 + 英语核心闭环

建议周期：4-5 周。

目标：让数学和英语两科达到可被种子老师真实测试的水平。

### 6.1 主要任务

1. 收集数学、英语各至少 20 张真实试卷 fixture。
2. 为 fixture 标注期望答案。
3. 建立 `scripts/accuracy-test.ts`。
4. 实现 `packages/ai`：
   - OpenAI-compatible client
   - runtime model config
   - Zod schemas
   - base prompt
   - math prompt
   - english prompt
   - `gradeExam`
5. 实现 `packages/jobs/grade-exam`：
   - 读取 grading record
   - 使用 `gradingId + organizationId` 双条件校验
   - 读取图片 URL
   - 调用 AI
   - 写 results
   - 写 totalScore / maxScore
   - 写 llmRawOutput
   - 写 tokens / cost / duration
   - 失败重试
   - 成功后扣配额
   - 成功后自动归集错题
6. 设置 worker 并发上限。
7. 设置单次批改成本熔断。
8. 前端批改入口：
   - 选择学生
   - 选择学科
   - 上传文件
   - 电脑摄像头拍照
   - 提交批改
9. 前端进度页：
   - 3 秒轮询
   - completed / failed 停止
   - 90 秒提示
10. 结果审核页：
   - 总分
   - 正确率
   - 错题数
   - 单题详情
   - 置信度标注
   - 字迹不清提示
   - 改分
   - 单题评语
   - 整卷评语
11. 实现历次成绩列表。
12. Dashboard 展示本月配额。
13. 配额超限阻止新批改。
14. Pino redact。
15. Sentry / PostHog 可配置，未配置时静默禁用。

### 6.2 阶段 1 内部拆分

建议拆成：

```text
阶段 1a：数学闭环 + 5 个种子老师
阶段 1b：英语加入 + 30 个种子老师
```

这样可以更早拿真实反馈，避免等两科都完成才开始验证。

### 6.3 阶段 1 验收

- 数学、英语客观题初始准确率达到 85% 以上。
- 高置信度题老师改分率进入可接受区间。
- prompt 更新导致对应学科准确率衰退超过 5% 时阻断发布。
- E2E 通过：
  - 登录
  - 创建学生
  - 上传 / 拍照
  - 批改
  - 轮询完成
  - 改分
- 批改 P95 目标小于 60 秒。
- 超过 90 秒时 UI 有兜底提示。
- LLM 失败自动重试上限 3 次。

---

## 阶段 2：语文 + 物理 + 化学扩科

建议周期：4-6 周。

目标：补齐完整 5 科，但按准确率门槛放量。

### 7.1 主要任务

1. 语文、物理、化学各收集至少 20 张真实试卷 fixture。
2. 新增学科 prompt：
   - `chinese`
   - `physics`
   - `chemistry`
3. 语文重点：
   - 古诗默写
   - 阅读题
   - 作文建议分
4. 物理重点：
   - 单位
   - 公式
   - 有效数字
5. 化学重点：
   - 方程式
   - 配平
   - 上下标
   - 实验题表达
6. UI 支持 5 科选择。
7. 弱科允许标注 beta。
8. 准确率测试扩展为 5 科统一报告。

### 7.2 阶段 2 验收

- 5 科均可完整走批改闭环。
- 阶段 2 完成后才对外宣称完整 5 科可用。
- 每科 prompt/schema 变更时跑对应学科 fixture。
- 准确率衰退超过 5% 不允许发布。

---

## 阶段 3：模板、错题本、学情、PDF

建议周期：4-5 周。

目标：从批改工具升级为学情资产工具。

### 8.1 主要任务

1. 保存为模板：
   - 从批改结果保存识别结果
   - 一键创建模板
2. 模板审核 / 编辑：
   - 题干
   - 正确答案
   - 分值
   - 知识点标签
3. 使用模板批改：
   - 不重复识别题目
   - 直接对照答案判分
4. 试卷库：
   - 列表
   - 学科 / 年级筛选
   - 重命名
   - 删除
   - 复制
5. 错题本 UI：
   - 自动去重归集
   - 列表
   - 搜索
   - 按知识点排序
   - 按时间排序
   - 按重复次数排序
   - 标记已掌握
6. 学情：
   - 历次成绩增强
   - 知识点热力图
   - 进步曲线
7. PDF：
   - `packages/pdf`
   - 批改报告导出
   - 错题导出
   - `generate-pdf` 异步 job

### 8.2 阶段 3 验收

- E2E 通过：
  - 登录
  - 创建学生
  - 批改
  - 错题本
  - PDF 导出
- 模板复用时不重复识别题目。
- 常规报告小于 10 秒生成。
- PDF 包含学生信息、试卷图、批改详情、总评。

---

## 阶段 4：增强能力与商业化

建议周期：不一次性承诺，根据种子用户反馈排序。

候选能力：

1. Google OAuth。
2. 组织邀请。
3. 切换组织。
4. 角色管理。
5. CSV 批量导入学生。
6. 学生身份识别。
7. 手机扫码拍照 H5。
8. 区域框选。
9. 多页试卷合并。
10. 家长 7 天签名分享链接。
11. 数据导出。
12. 账户注销。
13. 订阅支付。
14. 续费 / 取消订阅。
15. 机构教务看板。
16. 跨老师 / 跨科目共享学生档案。

阶段 4 准入标准：

- 必须有种子用户反馈、商业化必要性或明确数据支撑。
- 不作为一个大包一次性开发。
- 每个能力单独拆小版本验收。

---

## 六、测试策略

### 6.1 单元测试

目标：

- 工具函数覆盖率不低于 80%。
- `scopedDb` 覆盖率不低于 90%。
- AI schema / compare / scoring helper 尽量 100%。

### 6.2 集成测试

必须覆盖：

- 注册 -> personal organization 创建。
- 登录 -> session 获取。
- Org A 不能访问 Org B 学生。
- 上传 -> storage key 写入。
- grade -> 入队 -> worker -> status completed。
- worker organizationId 不匹配必须失败。

### 6.3 E2E 测试

阶段 1：

```text
登录 -> 创建学生 -> 上传/拍照 -> 批改 -> 轮询完成 -> 改分
```

阶段 3：

```text
登录 -> 创建学生 -> 批改 -> 错题本 -> 导出 PDF
```

阶段 4：

```text
电脑端发起 -> 手机端拍照 -> 电脑端加载图片
```

### 6.4 准确率测试

fixture 要求：

- 阶段 1：数学、英语各至少 20 张。
- 阶段 2：语文、物理、化学各至少 20 张。

输出指标：

- 客观题准确率。
- 主观题建议分偏差。
- 高置信度题老师改分率。
- 低置信度召回样例。
- 按学科统计。

CI 策略：

- PR 级只跑变更涉及学科。
- 全量回归可通过手动 workflow 或夜间任务运行。
- prompt/schema 变更准确率衰退超过 5% 阻断发布。

---

## 七、部署计划

生产部署采用：

- Git pull
- pnpm install
- pnpm build
- pnpm db:migrate
- PM2 reload
- Nginx 同域反代

PM2 三进程：

```text
teacher-score-web
teacher-score-api
teacher-score-worker
```

Nginx 分流：

```text
/api/* -> 127.0.0.1:3001
/*     -> 127.0.0.1:3000
```

阶段 0 完成时应至少验证一次 staging 形态，避免阶段 1 才发现 Cookie、rewrites、Nginx、PM2 进程边界问题。

---

## 八、文档同步计划

阶段 0 收尾时必须同步修订 `ARCHITECTURE.md` 中的旧内容：

1. `apps/web + apps/worker` 改为 `apps/web + apps/backend`。
2. Next Route Handlers 承载业务 API 改为 Hono backend。
3. Better-Auth server handler 移到 backend。
4. Supabase Realtime 改为轮询。
5. `apps/worker` 改为 `apps/backend/src/worker.ts`。
6. `subscriptionTier/monthlyQuota/isPersonal` 从 JSONB metadata 改为正式列。
7. PM2 两进程改为三进程。
8. worker payload 必须带 `organizationId`。

---

## 九、Codex 认为需要 Claude Code 重点评审的问题

1. 阶段 0 是否过重，是否需要再切成 0a / 0b？
2. 上传链路统一走 backend 是否合理，还是应阶段 0 就保留 Supabase signed URL？
3. `monthly_quotas` 采用累计表是否合理？
4. Better-Auth personal organization 自动创建的实现位置是否应放在 `packages/auth`？
5. no-raw-db ESLint 规则应该阶段 0 就强制，还是阶段 1 前强制？
6. 阶段 1 的数学 + 英语是否应拆成 1a / 1b？
7. 准确率测试的 CI 成本控制是否足够？
8. 是否还有文档中要求但本计划遗漏的功能或约束？

---

## 十、Codex 初步结论

Codex 初步判断：本计划可实施。

最大风险不在技术选型，而在阶段 0 的边界没有一次性拍清楚。如果上传、配额、auth organization、scopedDb、worker org 校验、no-raw-db lint 没有在阶段 0 做实，后续阶段 1 写真实批改闭环时会反复返工。

因此 Codex 建议阶段 0 不追求页面丰富度，但必须把架构红线和端到端空链路做硬。
