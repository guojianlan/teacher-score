# 开发任务清单 — 教师 LLM 批改 SaaS

> 日期：2026-05-13  
> 状态：最终一致版  
> 作者：Codex  
> 协作评审：Claude Code CLI 已确认同意，无阻塞项  
> 输入依据：`FINAL_IMPLEMENTATION_DECISION.md`、`DEVELOPMENT_PLAN.md`、`REQUIREMENTS.md`、`PRODUCT.md`、`ARCHITECTURE.md`、`CODEX_CLAUDE_DISCUSSION_LOG.md`、`DEVELOPMENT_PLAN_DISCUSSION_LOG.md`、`CODEX_DEVELOPMENT_PLAN_DRAFT.md`、`README.md`

---

## 一、文档定位

本文是基于当前全部 Markdown 文档整理出的开发任务清单，用于把最终开发计划拆成可执行、可验收、可追踪的任务。

执行优先级：

1. `FINAL_IMPLEMENTATION_DECISION.md` 是最高优先级架构依据。
2. `DEVELOPMENT_PLAN.md` 是最终阶段计划依据。
3. `REQUIREMENTS.md` 和 `PRODUCT.md` 定义产品范围、用户故事、阶段边界与验收口径。
4. `ARCHITECTURE.md` 只作为原始实现素材参考；若与最终执行版冲突，以最终执行版为准。

本文采用 checkbox 形式管理。每个任务完成前至少满足对应验收；涉及多租户、安全、认证、队列、上传、LLM 成本的任务必须补测试。

---

## 二、任务状态约定

| 状态 | 含义 |
|---|---|
| `[ ]` | 未开始 |
| `[~]` | 进行中 |
| `[x]` | 已完成 |
| `[!]` | 阻塞或需要重新决策 |

优先级：

| 优先级 | 含义 |
|---|---|
| P0 | 没有它不能进入下一阶段，或会造成安全 / 架构返工 |
| P1 | 阶段目标必要功能 |
| P2 | 可延后，但应有预留 |

---

## 三、全局技术红线

- [ ] P0：所有业务表必须包含 `organizationId`，并为 `organizationId` 建 index。
- [ ] P0：业务查询必须走 `scopedDb(organizationId)` 或同等封装。
- [ ] P0：业务代码禁止直接 import raw `db`，通过 `no-raw-db` ESLint 规则强制。
- [ ] P0：worker job payload 必须包含 `gradingId` 和 `organizationId`。
- [ ] P0：worker 读取 `grading_records` 必须同时校验 `id` 和 `organizationId`。
- [ ] P0：Better-Auth server handler 必须完整挂在 backend `/api/auth/*`。
- [ ] P0：`apps/web` 不保留 Better-Auth route handler，不承载业务 REST API。
- [ ] P0：浏览器统一请求同域 `/api/*`；本地通过 Next rewrites 代理到 backend。
- [ ] P0：RSC / Server Components 调 backend API 必须通过 `apiServer` 转发 Cookie。
- [ ] P0：阶段 0/1 批改进度使用 3 秒轮询，不使用 Supabase Realtime。
- [ ] P0：上传必须服务端校验 MIME / size，并用 `sharp` 清理 EXIF / GPS。
- [ ] P0：文件 key 必须以 `organizationId` 开头，跨 org 读取必须返回 403。
- [ ] P0：LLM prompt 不传学生真实姓名，使用 `[学生]` 占位。
- [ ] P0：日志不得输出密码、token、apiKey、邮箱、学生姓名等敏感字段。
- [ ] P0：`apps/backend/src/boss.ts` 只导出 PgBoss client / `sendJob` helper，不调用 `boss.start()`。
- [ ] P0：`apps/backend/src/worker.ts` 是唯一调用 `boss.start()` 并注册 worker handler 的入口。

---

## 四、阶段 0a：Monorepo、Auth、多租户底座

目标：建立可长期扩展的 monorepo、认证、组织、多租户和学生管理底座。

建议执行顺序：

1. [ ] P0：初始化 root workspace。
   - 建立 `package.json`、`pnpm-workspace.yaml`、`tsconfig.base.json`、`.nvmrc`、`.gitignore`。
   - Node 版本锁定 `20.9+`。
   - pnpm workspace 包含 `apps/*` 与 `packages/*`。
   - 验收：`pnpm install` 可运行，workspace package 能互相引用。

2. [ ] P0：建立共享工程配置。
   - 创建 `packages/config`。
   - 配置 TypeScript strict、ESLint flat config、Prettier、Vitest 基础配置。
   - 创建 `packages/types`，定义 `Subject`、`QuestionType`、`Confidence`、`Question`、`QuestionResult`、`GradingStatusResponse`。
   - 验收：root `pnpm lint`、`pnpm test` 脚本存在。

3. [ ] P0：建立日志包。
   - 创建 `packages/logger`。
   - 接入 Pino。
   - 配置 dev pretty transport。
   - 配置生产 JSON 日志。
   - 配置 redact：password、token、apiKey、email、studentName、student.name。
   - 验收：logger 可在 web/backend/jobs 中复用，未配置 Sentry 时不报错。

4. [ ] P0：建立数据库包。
   - 创建 `packages/db`。
   - 配置 Drizzle client、drizzle-kit、migration workflow。
   - 拆分 schema：`auth.ts`、`organizations.ts`、`students.ts`、`exam-papers.ts`、`grading-records.ts`、`mistake-collection.ts`、`quotas.ts`。
   - 创建 `scopedDb(organizationId)`。
   - 验收：`pnpm db:generate`、`pnpm db:migrate` 脚本存在并可连通测试库。

5. [ ] P0：实现 Better-Auth 数据表。
   - 建立 user/session/account/verification 等 Better-Auth 必需表。
   - `session` 支持 `activeOrganizationId`。
   - 验收：Better-Auth adapter 可以使用 Drizzle 表。

6. [ ] P0：实现 organization 数据模型。
   - 建立 `organizations`、`members`、`invitations`。
   - `organizations` 必须包含正式列：
     - `isPersonal boolean not null default false`
     - `subscriptionTier enum('free','basic','pro','plus') not null default 'free'`
     - `monthlyQuota integer not null default 50`
   - 不使用 JSONB metadata 存储以上核心套餐字段。
   - 验收：personal org 默认 `isPersonal=true`、`subscriptionTier='free'`、`monthlyQuota=50`。

7. [ ] P0：实现业务核心表。
   - `students`
   - `exam_papers`
   - `grading_records`
   - `mistake_collection`
   - `monthly_quotas`
   - 验收：所有业务表带 `organizationId`，所有业务表有 org index。

8. [ ] P0：实现 `monthly_quotas`。
   - 复合主键：`(organizationId, yearMonth)`。
   - 字段：`gradingsUsed`、`tokensUsed`、`costCents`、`updatedAt`。
   - 验收：可按 org + 月份累计批改次数、token 和成本。

9. [ ] P0：实现 Auth 包。
   - 创建 `packages/auth`。
   - 封装 Better-Auth server config。
   - 封装 Better-Auth client export。
   - 实现 email/password 注册、登录、忘记密码、修改密码能力。
   - 实现 personal organization 创建 hook。
   - 验收：新用户注册后自动创建 personal org，并自动成为 owner。

10. [ ] P0：建立 email 包。
    - 创建 `packages/email`。
    - dev 使用 console transport 或 Mailpit。
    - production 预留 Resend transport。
    - 验收：密码重置邮件在 dev 环境可被观察，不配置 Resend 时不阻塞本地开发。

11. [ ] P0：创建 backend app。
    - 创建 `apps/backend`。
    - 使用 Hono。
    - 建立 `src/app.ts`、`src/http.ts`、`src/worker.ts`、`src/boss.ts`。
    - 建立 `routes/` 与 `middleware/`。
    - 验收：`pnpm dev:backend` 可启动 Hono，`GET /api/health` 返回成功。

12. [ ] P0：挂载 Better-Auth server handler。
    - backend Hono 挂载 `/api/auth/*`。
    - `POST /api/auth/sign-up/email` 命中 backend。
    - OAuth callback 后续也由 backend 处理。
    - 验收：`apps/web` 不存在 Better-Auth route handler。

13. [ ] P0：实现 backend middleware。
    - session middleware。
    - require-org middleware。
    - quota middleware。
    - rate-limit middleware。
    - 验收：未登录返回 401；不属于 active org 返回 403；active org 缺失时回退 personal org 或返回明确错误。

14. [ ] P0：实现阶段 0 API 限流。
    - 每用户普通 API ≤ 100 req/min。
    - 全局 IP ≤ 1000 req/min。
    - 阶段 0 单机 PM2 形态下使用进程内 token bucket。
    - 验收：测试覆盖正常放行、超限 429、不同用户/IP 隔离。

15. [ ] P0：实现 `no-raw-db` ESLint 规则。
    - 禁止业务层 import `db`。
    - 允许例外：`packages/db`、`packages/auth`、`apps/backend/src/worker.ts` 或明确封装文件。
    - 验收：故意在业务 route 中 import raw `db` 会 lint 失败。

16. [ ] P1：创建 web app。
    - 创建 `apps/web`。
    - 使用 Next.js 16。
    - 接入 Chakra UI。
    - 建立 `(auth)`、`(app)` 路由分组。
    - 建立 Dashboard shell。
    - 验收：`pnpm dev:web` 可启动，登录后可进入 Dashboard 空壳。

17. [ ] P0：实现 web API 访问封装。
    - `api-client.ts`：浏览器端统一请求同域 `/api/*`。
    - `api-server.ts`：RSC / Server Components 读取 `cookies()` 并转发到 `INTERNAL_API_URL`。
    - Next rewrites：`/api/:path*` 转发到 `BACKEND_INTERNAL_URL`。
    - 验收：本地浏览器请求 `localhost:3000/api/*`，实际由 backend 处理且 Cookie 可用。

18. [ ] P1：实现登录 / 注册 / 重置密码 UI。
    - 邮箱注册。
    - 邮箱登录。
    - 忘记密码。
    - 修改密码入口。
    - 验收：注册 -> 自动创建 personal org -> 自动登录 -> Dashboard，全程小于 60 秒。

19. [ ] P1：实现学生 CRUD API。
    - `GET /api/students`
    - `POST /api/students`
    - `PATCH /api/students/:id`
    - `DELETE /api/students/:id` 软删除 archived。
    - 搜索、年级筛选、学科筛选。
    - 备注字段支持 ≤ 5000 字符。
    - 验收：创建、编辑、删除、搜索、筛选均按 organization 隔离。

20. [ ] P1：实现学生管理 UI。
    - 学生列表。
    - 新建 / 编辑表单。
    - 删除确认弹窗。
    - 搜索和筛选。
    - 备注展示与编辑。
    - 验收：100+ 学生时列表仍可流畅使用。

21. [ ] P0：完成阶段 0a 测试。
    - 注册 -> personal organization 创建。
    - personal org 默认 free + monthlyQuota 50。
    - 登录 -> session 获取。
    - Org A 不能访问 Org B 学生。
    - raw `db` import 被 lint 拦截。
    - `apps/web` 没有 Better-Auth route handler。
    - `POST /api/auth/sign-up/email` 命中 backend。

阶段 0a 完成标准：

- [ ] 新用户能注册、登录、进入 Dashboard。
- [ ] personal organization 自动创建并设置正确默认套餐字段。
- [ ] 学生 CRUD 可用。
- [ ] 多租户隔离和 no-raw-db 规则已自动化验证。
- [ ] web/backend 本地同域代理与 Cookie 转发跑通。

---

## 五、阶段 0b：上传、队列、worker 空链路

目标：跑通图片上传、grading record 创建、pg-boss 入队、worker 消费、状态轮询的端到端空链路。

1. [ ] P0：创建 storage 包。
   - 创建 `packages/storage`。
   - 定义 `StorageProvider` interface。
   - 实现 local provider。
   - 预留 Supabase provider skeleton。
   - 验收：dev/test 默认 local；staging/production 可切 Supabase。

2. [ ] P0：实现文件 key 规范。
   - 格式：`{organizationId}/{year}/{month}/{type}/{ulid}.{ext}`。
   - type 至少支持 `student-answer`、`exam-paper`、`pdf-report`。
   - 验收：所有上传 key 都以当前 org id 开头。

3. [ ] P0：实现 backend 上传 API。
   - `POST /api/upload`。
   - multipart 接收。
   - 支持 jpg / png / webp / heic。
   - 单文件 ≤ 10MB。
   - 服务端 MIME 校验。
   - `sharp` 清理 EXIF / GPS。
   - 写入 storage。
   - 返回 `{ key }`。
   - 验收：非法 MIME、超大文件、跨 org key 均被拒绝。

4. [ ] P0：实现 storage 访问授权。
   - 读取时校验 `(organizationId, key)`。
   - 跨 org 读取 storage key 返回 403。
   - 验收：集成测试覆盖跨 org 读取失败。

5. [ ] P1：实现 web 上传入口。
   - 上传已有图片文件。
   - 支持拖拽 + 点击上传。
   - 上传状态、错误提示、重试。
   - 验收：iOS Safari 15+ 上传入口可用。

6. [ ] P0：创建 AI 包骨架。
   - 创建 `packages/ai`。
   - OpenAI-compatible client config。
   - `Subject` enum 对齐 5 科。
   - Zod schema placeholder。
   - prompt placeholder。
   - 验收：暂不真实调用 LLM，但类型和入口稳定。

7. [ ] P0：创建 jobs 包。
   - 创建 `packages/jobs`。
   - 定义 job payload schema。
   - 实现 `gradeExamJobHandler` 空实现。
   - 验收：handler 不启动进程，只接收依赖和 payload 执行业务逻辑。

8. [ ] P0：实现 `apps/backend/src/boss.ts`。
   - 导出 PgBoss client 单例。
   - 导出 `sendJob(name, payload)`。
   - 不调用 `boss.start()`。
   - 不注册 worker handler。
   - 不处理进程信号。
   - 验收：import `boss.ts` 不会启动 consumer。

9. [ ] P0：实现 `POST /api/grade` 空链路。
   - 校验 session。
   - 校验 organization。
   - 校验 quota。
   - 校验 student 属于当前 organization。
   - 创建 `grading_records(status='pending')`。
   - 入队 `grade-exam`，payload 为 `{ gradingId, organizationId }`。
   - 小于 1 秒返回 `{ gradingId }`。
   - 验收：payload 不允许缺失 `organizationId`。

10. [ ] P0：实现 `GET /api/grade/:id/status`。
    - 返回 `status`。
    - 可选返回 `progress`：`queued`、`recognizing`、`scoring`、`finalizing`。
    - 失败时返回 `errorCode`、`retryable`。
    - 查询必须按当前 org 隔离。
    - 验收：Org A 不能查询 Org B 的 grading status。

11. [ ] P0：实现 worker 入口。
    - `apps/backend/src/worker.ts` 唯一调用 `boss.start()`。
    - 注册 `grade-exam` 测试 job。
    - pending -> processing -> completed。
    - SIGTERM / SIGINT 优雅退出。
    - 默认 `teamSize=2`，放入配置。
    - 验收：worker 单独启动可消费任务并写回状态。

12. [ ] P1：实现前端批改状态轮询页。
    - 提交批改后每 3 秒轮询。
    - completed / failed 后停止。
    - 90 秒未完成提示“仍在处理中，可稍后刷新”。
    - 验收：不会无限轮询；失败状态显示可理解错误。

13. [ ] P0：实现 worker 多租户负向测试。
    - 创建 Org A grading record。
    - 伪造 Org B 的 `organizationId` job payload。
    - worker 拒绝处理。
    - `grading_records.status` 仍为 pending。
    - grading record 其他字段不被写入。
    - 验收：该测试必须进入阶段 0 CI。

14. [ ] P0：实现 upload/storage 多租户负向测试。
    - Org A 上传文件。
    - Org B 读取同 key。
    - 返回 403。
    - 验收：文件 key org prefix 与授权校验均被覆盖。

15. [ ] P1：建立 PM2 三进程配置。
    - `teacher-score-web`
    - `teacher-score-api`
    - `teacher-score-worker`
    - 验收：同一个 `apps/backend` 可以分别跑 `dist/http.js` 和 `dist/worker.js`。

16. [ ] P1：建立 staging 验证形态。
    - Nginx `/api/* -> 127.0.0.1:3001`。
    - `/* -> 127.0.0.1:3000`。
    - Supabase Postgres 可连接。
    - production storage 默认 Supabase Storage。
    - 验收：至少跑通一次 web/api/worker 三进程和同域 Cookie。

阶段 0b 完成标准：

- [ ] 可以上传图片，且完成 MIME 校验和 EXIF 清洗。
- [ ] 可以创建 grading record。
- [ ] worker 能消费测试 job 并写回 completed。
- [ ] 前端可以通过轮询看到 completed。
- [ ] 伪造 organizationId 的 worker job 不会修改 grading record。
- [ ] 跨 org 读取 storage key 返回 403。
- [ ] `lint`、`test`、`build` 通过。
- [ ] staging 形态验证通过。

---

## 六、阶段 1a：数学闭环 + 5 个种子老师

目标：数学先跑通真实 LLM 批改闭环，并进入小范围种子测试。

1. [ ] P0：收集数学 fixture。
   - 至少 20 张真实数学试卷或答卷图片。
   - 标注期望答案、题型、分值、知识点。
   - 覆盖选择、填空、短答、字迹不清样例。
   - 验收：fixture 可被 `scripts/accuracy-test.ts` 读取。

2. [ ] P0：建立准确率测试脚本。
   - 创建 `scripts/accuracy-test.ts`。
   - 支持按学科运行。
   - 输出客观题准确率、主观题建议分偏差、高置信度题老师改分率、低置信度召回样例。
   - 准确率衰退 > 5% 返回非零。
   - 验收：数学 fixture 可生成报告。

3. [ ] P0：实现 AI client。
   - 支持 `AI_BASE_URL`、`AI_API_KEY`、`AI_VISION_MODEL`。
   - 支持运行时模型配置。
   - 统一记录 token、耗时、成本、模型、学科。
   - 未配置 key 时在测试环境可 mock。
   - 验收：真实调用和 mock 调用路径分离清晰。

4. [ ] P0：实现 AI schema。
   - 每题包含 question no/type/stem/studentAnswer/correctAnswer/isCorrect/score/maxScore/knowledgeTags/comment/confidence。
   - 总体包含 totalScore、maxScore、overallComment、unrecognizedRegions。
   - Zod 校验失败可重试或记录明确错误。
   - 验收：schema 与 DB `QuestionResult` 类型对齐。

5. [ ] P0：实现 base prompt 与 math prompt。
   - 严格 JSON 输出。
   - 每题必须给 confidence。
   - 字迹不清不得瞎判。
   - 学生姓名统一替换为 `[学生]`。
   - 数学支持等价判断、单位、有效数字。
   - 验收：数学 fixture 初始客观题准确率 ≥ 85%。

6. [ ] P0：实现真实 `gradeExamJobHandler`。
   - 按 `gradingId + organizationId` 读取 grading record。
   - 读取图片 URL。
   - 调用 AI。
   - 写 results、totalScore、maxScore、llmRawOutput。
   - 写 tokens、cost、duration。
   - 成功后扣配额。
   - 成功后自动归集错题数据。
   - 失败后写 failed 状态和错误码。
   - 验收：worker 对 org 不匹配 payload 仍然拒绝处理。

7. [ ] P0：实现 LLM 失败重试。
   - 自动重试上限 3 次。
   - 可区分 retryable 和 non-retryable。
   - 最终失败保留原图和 grading record。
   - 验收：失败后用户可以一键重试。

8. [ ] P0：实现成本熔断。
   - 默认单次 token > 8k 或成本 > $0.20 时 fail + 告警记录。
   - 限制值进入配置。
   - 验收：超限不会继续扣费式调用。

9. [ ] P0：实现 LLM 专用限流。
   - `POST /api/grade` ≤ 10/min/user。
   - `POST /api/grade` ≤ 100/day/user。
   - 月度用量通过 `monthly_quotas` 记录。
   - 验收：超限时返回可理解错误并阻止新批改。

10. [ ] P1：实现电脑摄像头拍照。
    - getUserMedia。
    - 对焦框 / 预览 / 重拍。
    - 摄像头不可用时回退文件上传。
    - 验收：Chrome / Edge / Safari 最近 2 个版本可用。

11. [ ] P1：实现批改入口 UI。
    - 选择学生。
    - 选择学科。
    - 上传文件。
    - 电脑摄像头拍照。
    - 提交批改。
    - 验收：提交后小于 1 秒进入处理中状态。

12. [ ] P1：实现结果审核页。
    - 总分。
    - 正确率。
    - 错题数。
    - 单题详情。
    - 置信度标注。
    - 字迹不清提示。
    - 一键改分。
    - 单题评语。
    - 整卷评语。
    - 验收：改分实时保存，`teacherModified=true`，总分自动重算。

13. [ ] P1：实现错题自动归集数据写入。
    - 批改完成后将错误题写入 `mistake_collection`。
    - 使用 `questionHash` 去重。
    - 更新 occurrences、lastSeenAt。
    - 验收：同题多次错误不会重复创建多条主记录。

14. [ ] P1：实现 Dashboard 配额展示。
    - 展示本月已用 / 总配额。
    - 临近耗尽时提示。
    - 达上限提示升级或等待下月。
    - 验收：免费层默认每月 50 次。

15. [ ] P1：接入可观测性开关。
    - Sentry 可配置，未配置时静默禁用。
    - PostHog server/client wrapper 在阶段 1 初始化。
    - Pino redact 生效。
    - 验收：未配置 key 时不影响本地开发。

16. [ ] P1：建立阶段 1 E2E。
    - 登录。
    - 创建学生。
    - 上传 / 拍照。
    - 批改。
    - 轮询完成。
    - 改分。
    - 验收：阶段 1a 主路径 Playwright 通过。

阶段 1a 完成标准：

- [ ] 数学客观题初始准确率 ≥ 85%。
- [ ] 批改 P95 目标小于 60 秒。
- [ ] 超过 90 秒 UI 有兜底提示。
- [ ] LLM 失败自动重试上限 3 次。
- [ ] getUserMedia 不可用时可回退文件上传。
- [ ] 至少 5 个种子老师可真实试用数学闭环。

---

## 七、阶段 1b：英语加入 + 30 个种子老师

目标：英语加入核心闭环，数学 + 英语一起进入更大范围种子测试。

1. [ ] P0：收集英语 fixture。
   - 至少 20 张真实英语试卷或答卷图片。
   - 标注期望答案、题型、分值、知识点。
   - 覆盖选择、填空、阅读、作文/短文主观建议分样例。
   - 验收：英语 fixture 可被准确率脚本读取。

2. [ ] P0：实现 english prompt。
   - 处理拼写容错策略。
   - 主观题只给建议分和理由。
   - 每题必须输出 confidence。
   - 验收：英语客观题初始准确率 ≥ 85%。

3. [ ] P0：扩展准确率测试为 math + english。
   - 按学科分别输出。
   - prompt/schema 变更只跑受影响学科。
   - 衰退 > 5% 阻断发布。
   - 验收：数学、英语均有 baseline。

4. [ ] P1：补足英语题型展示。
   - 选择题。
   - 填空题。
   - 阅读题。
   - 作文 / 主观建议分。
   - 验收：结果审核页能清楚展示英语题型和评分理由。

5. [ ] P1：实现历次成绩列表。
   - 按时间倒序。
   - 展示日期、试卷、学科、得分、正确率。
   - 可按学生、学科筛选。
   - 验收：学生详情页能看到历史批改记录。

6. [ ] P1：补齐种子老师运营埋点。
   - `user_signed_up`
   - `student_created`
   - `grading_started`
   - `grading_completed`
   - `grading_score_modified`
   - `quota_exceeded`
   - 验收：未配置 PostHog 时静默禁用，配置后能记录事件。

阶段 1b 完成标准：

- [ ] 英语客观题初始准确率 ≥ 85%。
- [ ] 数学、英语 prompt 更新导致准确率衰退 > 5% 时阻断发布。
- [ ] 高置信度题老师改分率进入可接受区间。
- [ ] 30 个种子老师可进入试用。
- [ ] 可以开始观察 W4 留存。

---

## 八、阶段 2：语文、物理、化学扩科

目标：补齐完整 5 科，但按准确率门槛放量。

1. [ ] P0：收集语文 fixture，至少 20 张。
2. [ ] P0：收集物理 fixture，至少 20 张。
3. [ ] P0：收集化学 fixture，至少 20 张。
4. [ ] P0：新增 chinese prompt。
   - 重点覆盖古诗默写、阅读题、作文建议分。
5. [ ] P0：新增 physics prompt。
   - 重点覆盖单位、公式、有效数字。
6. [ ] P0：新增 chemistry prompt。
   - 重点覆盖方程式、配平、上下标、实验题表达。
7. [ ] P1：UI 支持 5 科选择。
8. [ ] P1：弱科支持 beta 标识。
9. [ ] P0：准确率测试扩展为 5 科统一报告。
10. [ ] P0：每科 prompt/schema 变更时只跑对应学科 fixture。

阶段 2 完成标准：

- [ ] 5 科均可完整走批改闭环。
- [ ] 阶段 2 完成后才对外宣称完整 5 科可用。
- [ ] 每科都有 fixture 和准确率 baseline。
- [ ] 准确率衰退 > 5% 不允许发布。

---

## 九、阶段 3：模板、错题本、学情、PDF

目标：从批改工具升级为学情资产工具。

1. [ ] P1：初始化 `packages/pdf`。
2. [ ] P1：实现保存为模板。
   - 从批改结果保存识别结果。
   - 一键创建模板。
3. [ ] P1：实现模板审核 / 编辑。
   - 题干。
   - 正确答案。
   - 分值。
   - 知识点标签。
4. [ ] P1：实现使用模板批改。
   - 模板存在时不重复识别题目。
   - 直接对照答案判分。
5. [ ] P1：实现试卷库。
   - 列表。
   - 学科 / 年级筛选。
   - 重命名。
   - 删除。
   - 复制。
6. [ ] P1：实现错题本 UI。
   - 列表。
   - 搜索。
   - 按知识点排序。
   - 按时间排序。
   - 按重复次数排序。
   - 标记已掌握。
7. [ ] P1：实现学情基础能力。
   - 历次成绩增强。
   - 知识点热力图。
   - 进步曲线。
8. [ ] P1：实现 PDF 批改报告导出。
   - 学生信息。
   - 试卷图。
   - 批改详情。
   - 总评。
9. [ ] P1：实现错题导出 PDF。
   - 原题。
   - 正确答案。
   - 可选讲解。
10. [ ] P1：实现 `generate-pdf` 异步 job。

阶段 3 完成标准：

- [ ] 阶段 3 E2E 通过：登录 -> 创建学生 -> 批改 -> 错题本 -> PDF 导出。
- [ ] 模板复用时不重复识别题目。
- [ ] 常规报告小于 10 秒生成。
- [ ] PDF 包含学生信息、试卷图、批改详情、总评。

---

## 十、阶段 4：增强能力与商业化

目标：只按种子用户反馈、商业化必要性或明确数据支撑逐项开发，不作为一个大包一次性承诺。

候选任务：

- [ ] P2：Google OAuth。
- [ ] P2：邀请老师加入机构。
- [ ] P2：切换组织。
- [ ] P2：角色管理 owner/admin/member。
- [ ] P2：CSV 批量导入学生。
- [ ] P2：学生身份识别。
- [ ] P2：手机扫码拍照 H5。
- [ ] P2：区域框选。
- [ ] P2：多页试卷合并。
- [ ] P2：家长 7 天签名分享链接。
- [ ] P2：数据导出。
- [ ] P2：账户注销。
- [ ] P2：订阅支付。
- [ ] P2：续费 / 取消订阅。
- [ ] P2：机构教务看板。
- [ ] P2：跨老师 / 跨科目共享学生档案。

阶段 4 单项准入标准：

- [ ] 有种子用户反馈、商业化必要性或明确数据支撑。
- [ ] 有独立验收标准。
- [ ] 不破坏阶段 0-3 的多租户、安全、队列和成本边界。

---

## 十一、测试与 CI 清单

1. [ ] P0：root CI 执行 lint、typecheck、unit test。
2. [ ] P0：Auth 集成测试：注册 -> personal org 创建 -> 登录 -> 改密 -> 登出。
3. [ ] P0：多租户集成测试：Org A 不能访问 Org B 学生、grading record、storage key。
4. [ ] P0：worker 安全测试：伪造 organizationId payload 不修改记录。
5. [ ] P0：上传安全测试：MIME、size、EXIF strip、org key prefix。
6. [ ] P0：rate-limit 测试：普通 API、全局 IP、LLM 专用限流。
7. [ ] P1：阶段 1 E2E：登录 -> 加学生 -> 上传/拍照 -> 批改 -> 轮询完成 -> 改分。
8. [ ] P1：阶段 3 E2E：登录 -> 加学生 -> 批改 -> 错题本 -> 导出 PDF。
9. [ ] P1：准确率 CI。
   - prompt/schema 变更自动跑对应学科。
   - 全量回归通过手动 workflow 或夜间任务运行。
   - 准确率衰退 > 5% 阻断发布。

---

## 十二、部署与环境清单

1. [ ] P0：根目录 `.env.example`。
   - Database。
   - Auth。
   - AI。
   - Storage。
   - Email。
   - Monitoring。
   - Analytics。
   - App URLs。
2. [ ] P0：明确 `apps/web` 与 `apps/backend` env 加载策略。
3. [ ] P1：PM2 三进程配置。
4. [ ] P1：Nginx 同域代理配置。
5. [ ] P1：Supabase Postgres region 优先香港或新加坡。
6. [ ] P1：staging 环境至少验证一次完整链路。
7. [ ] P1：生产发版流程文档化。
   - `git pull`
   - `pnpm install --frozen-lockfile`
   - `pnpm build`
   - `pnpm db:migrate`
   - `pm2 reload ecosystem.config.js --env production`

---

## 十三、旧架构草案冲突项处理

以下内容出现在原始 `ARCHITECTURE.md`，但不得作为最终实现依据：

- [ ] 不采用 `apps/web + apps/worker`，采用 `apps/web + apps/backend`。
- [ ] 不在 `apps/web` Route Handlers 中承载业务 REST API。
- [ ] 不在 `apps/web` 中承载 Better-Auth server handler。
- [ ] 不在 Route Handler 顶层创建并 `start()` PgBoss。
- [ ] 不优先采用 Supabase Realtime 作为批改进度方案。
- [ ] 不把 `subscriptionTier`、`monthlyQuota`、`isPersonal` 放在 organization JSONB metadata。
- [ ] 不优先采用前端 signed URL 直传；阶段 0 统一走 backend multipart 上传并清理 EXIF。
- [ ] PM2 不使用两进程 web/worker，使用三进程 web/api/worker。

阶段 0 收尾文档任务：

- [ ] P1：同步修订 `ARCHITECTURE.md`，移除或标注旧实现路径。
- [ ] P1：同步修订 README 阅读顺序与当前清单链接。
- [ ] P1：若实际实现与计划变化，更新 `DEVELOPMENT_PLAN.md` 和 `REQUIREMENTS.md`。

---

## 十四、首批建议 PR / 开发切片

以下切片用于减少单次改动范围，每个切片尽量能独立 lint/test：

1. [ ] PR-00：root workspace 初始化。
2. [ ] PR-01：`packages/config`、`packages/types`、`packages/logger`。
3. [ ] PR-02：`packages/db` schema、Drizzle、migration。
4. [ ] PR-03：`packages/auth`、Better-Auth、personal org hook。
5. [ ] PR-04：`apps/backend` Hono、health、auth handler、middleware 骨架。
6. [ ] PR-05：`apps/web` Next + Chakra + API proxy + auth UI。
7. [ ] PR-06：学生 CRUD API + UI + 多租户测试。
8. [ ] PR-07：storage package + upload API + upload UI。
9. [ ] PR-08：PgBoss boss.ts、grade API、worker 空链路、status polling。
10. [ ] PR-09：worker/storage 多租户负向测试、rate-limit、PM2 三进程。
11. [ ] PR-10：数学 fixture、accuracy-test、AI schema/client/prompt。
12. [ ] PR-11：真实 grade-exam job、结果审核页、改分。
13. [ ] PR-12：配额、LLM 限流、成本熔断、Sentry/PostHog 可配置。
14. [ ] PR-13：英语 fixture/prompt/展示，种子运营埋点。

---

## 十五、Claude Code CLI 评审结论

评审命令：

```bash
claude -p "请作为 Claude Code 独立架构/开发计划评审员，读取 docs/claude/DEVELOPMENT_TASK_CHECKLIST.md，并交叉参考 docs/claude/FINAL_IMPLEMENTATION_DECISION.md、docs/claude/DEVELOPMENT_PLAN.md、docs/claude/REQUIREMENTS.md、docs/claude/PRODUCT.md、docs/claude/ARCHITECTURE.md、docs/claude/CODEX_CLAUDE_DISCUSSION_LOG.md、docs/claude/DEVELOPMENT_PLAN_DISCUSSION_LOG.md。请判断：1) 是否同意这份开发任务清单的阶段拆分和 PR 切片；2) 是否遗漏最终计划中的硬验收项；3) 是否仍被旧 ARCHITECTURE.md 误导；4) 如不同意，请列出必须修改项，格式为 M1/M2...；如同意，请明确输出：同意，无阻塞项。请只评审文档，不修改文件。"
```

Claude Code CLI 结论：

> 同意，无阻塞项。

Claude Code CLI 核对结果：

1. 阶段 0a / 0b 拆分清晰：0a 锁 monorepo、auth、多租户、学生 CRUD；0b 锁上传、队列、worker 空链路。
2. 阶段 1a / 1b 拆分合理：1a 先做数学闭环与 5 个种子老师；1b 加入英语、历次成绩与种子运营埋点。
3. 阶段 2 / 3 / 4 与最终开发计划一致，阶段 4 没有被打包成一次性承诺。
4. 多租户、auth backend 边界、worker org 双校验、上传安全、轮询进度、限流配额、成本熔断、准确率门槛、PM2 三进程、staging 验证等硬验收项均已覆盖。
5. `ARCHITECTURE.md` 的旧方案冲突项已在第十三节明确列出，没有被旧架构误导。
6. 首批 PR 切片依赖顺序合理，每片都能独立 lint/test/build。

Claude Code CLI 的非阻塞观察：

- `DEVELOPMENT_PLAN.md` 中错题自动归集同时出现在阶段 1a 的真实 `gradeExamJobHandler` 任务和阶段 1b 的数据写入任务语境里；本文将“错题自动归集数据写入”放在阶段 1a，是更合理的归并方式，因为真实批改 job 完成时就应该写入错题数据。

最终共识：

1. 本文可以作为后续开发任务清单执行。
2. 不需要再拆分阶段 0a / 0b 或阶段 1a / 1b。
3. 不需要调整首批 PR / 开发切片顺序。
4. 后续若实际实现范围变化，应同步更新本文、`DEVELOPMENT_PLAN.md` 与 `REQUIREMENTS.md`。
