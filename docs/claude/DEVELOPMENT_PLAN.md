# 开发计划 — 教师 LLM 批改 SaaS

> 日期：2026-05-13  
> 状态：最终执行版  
> 作者：Codex  
> 协作评审：Claude Code  
> 输入依据：`PRODUCT.md`、`REQUIREMENTS.md`、`FINAL_IMPLEMENTATION_DECISION.md`、`ARCHITECTURE.md`、`CODEX_CLAUDE_DISCUSSION_LOG.md`、`CODEX_DEVELOPMENT_PLAN_DRAFT.md`

---

## 一、结论

本项目可以进入开发实施。

本计划由 Codex 先基于现有 Markdown 文档整理出 `CODEX_DEVELOPMENT_PLAN_DRAFT.md`，再交由 Claude Code 审阅。Claude Code 提出 6 个必须修改项，Codex 全部接受并进行二轮确认。Claude Code 最终明确同意按本文落地实施。

最终执行原则：

1. `FINAL_IMPLEMENTATION_DECISION.md` 是最高优先级执行依据。
2. `ARCHITECTURE.md` 是原始技术草案，若与最终执行版冲突，以最终执行版为准。
3. 采用 `apps/web + apps/backend + packages/*`。
4. `apps/backend` 使用 Hono，并包含 `http.ts` 与 `worker.ts` 两个入口。
5. Worker 进程不放入 `packages`，纯任务逻辑放入 `packages/jobs`。
6. Better-Auth server handler 完整运行在 backend `/api/auth/*`。
7. 批改进度使用轮询，不使用 Supabase Realtime。
8. 租户边界是 `organization`。
9. 完整 5 科保留，但必须分阶段推进，每科必须有 fixture 和准确率回归门槛。

---

## 二、产品目标

构建面向一对一辅导老师的 LLM 批改 SaaS。

核心路径：

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

长期支持 5 科：

- 数学
- 英语
- 语文
- 物理
- 化学

但阶段 1 只把数学和英语打磨到可种子测试状态；阶段 2 后才对外宣称完整 5 科可用。

---

## 三、最终架构

### 3.1 Monorepo 结构

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

包初始化顺序：

| 阶段 | 初始化包 |
|---|---|
| 阶段 0 | `config`、`types`、`logger`、`db`、`auth`、`storage`、`jobs`、`ai`、`email` |
| 阶段 1 | `analytics` |
| 阶段 3 | `pdf` |

目录结构保留完整长期清单，但不要在阶段 0 为 `analytics` 和 `pdf` 做空实现。

### 3.2 apps/web 职责

`apps/web` 使用 Next.js 16，负责：

- 页面路由。
- 登录 / 注册 UI。
- Dashboard 与业务页面。
- SSR / RSC / SSG / ISR / CSR。
- Chakra UI 组件与交互。
- 浏览器端统一请求同域 `/api/*`。
- 本地开发通过 Next rewrites 转发 `/api/*` 到 backend。
- RSC / Server Components 调 backend API 时转发 Cookie。

`apps/web` 不负责：

- 直接访问数据库。
- 直接调用 LLM。
- 消费 pg-boss 队列。
- 承载 Better-Auth server handler。
- 承载业务 REST API。

RSC / Server Components 调 backend API 必须统一封装：

```typescript
// apps/web/src/lib/api-server.ts
import { cookies } from 'next/headers';

export async function apiServer<T>(path: string, init?: RequestInit): Promise<T> {
  const cookieStore = await cookies();
  const res = await fetch(`${process.env.INTERNAL_API_URL}${path}`, {
    ...init,
    headers: {
      ...init?.headers,
      Cookie: cookieStore.toString(),
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error(`API ${path} failed: ${res.status}`);
  }

  return res.json() as Promise<T>;
}
```

浏览器端统一请求 `/api/*`，由 rewrites 或 Nginx 保持同域。

### 3.3 apps/backend 职责

`apps/backend` 使用 Hono，包含两个启动入口：

```text
apps/backend/src/http.ts
apps/backend/src/worker.ts
```

`http.ts` 负责：

- 启动 Hono HTTP API。
- Better-Auth server handler：`/api/auth/*`。
- 业务 REST API：
  - `/api/students`
  - `/api/upload`
  - `/api/grade`
  - `/api/papers`
  - `/api/mistakes`
  - `/api/quotas`
  - `/api/health`
- session middleware。
- require organization middleware。
- quota middleware。
- rate-limit middleware。

`worker.ts` 负责：

- 唯一调用 `boss.start()`。
- 注册 `grade-exam`、`generate-pdf`、`extract-template`、`cleanup-orphan-files` 等任务。
- 管理 worker 进程生命周期。
- SIGTERM / SIGINT 优雅退出。

`apps/backend/src/boss.ts` 边界必须写死：

- 只导出 PgBoss client 单例、`sendJob(name, payload)` 等入队 helper。
- 不在模块加载时调用 `boss.start()`。
- 不注册 worker handler。
- 不处理进程信号。
- `worker.ts` 是唯一启动 pg-boss consumer 的地方。

### 3.4 packages 职责

| 包 | 职责 |
|---|---|
| `packages/db` | Drizzle schema、migration、db client、`scopedDb` |
| `packages/auth` | Better-Auth 配置、client/server exports、hooks |
| `packages/ai` | OpenAI-compatible client、prompt、Zod schema、grader |
| `packages/storage` | local / Supabase Storage provider |
| `packages/jobs` | 纯 job handler，如 `gradeExamJobHandler` |
| `packages/pdf` | PDF 报告生成，阶段 3 初始化 |
| `packages/logger` | Pino logger、redact、Sentry bridge |
| `packages/analytics` | PostHog 封装，阶段 1 初始化 |
| `packages/email` | Resend / dev mail transport |
| `packages/types` | 跨包共享类型 |
| `packages/config` | TS / ESLint / Prettier 共享配置 |

---

## 四、技术红线

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
- storage 读取必须校验 `(organizationId, key)`，跨 org 读取 key 必须 403。

### 4.2 Auth 边界

Better-Auth server handler 必须完整运行在 backend：

```text
apps/backend
  /api/auth/*
```

阶段 0 必须明确：

- `apps/web` 不保留任何 Better-Auth route handler。
- `POST /api/auth/sign-up/email` 命中 backend。
- OAuth callback 后续也由 backend 处理。

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

`GET /api/grade/:id/status` 响应 schema 在阶段 0 固定：

```typescript
type GradingStatusResponse = {
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress?: 'queued' | 'recognizing' | 'scoring' | 'finalizing';
  errorCode?: string;
  retryable?: boolean;
};
```

### 4.4 限流与配额

限流和配额是两件事：

- 限流：保护 API 和 LLM 入口，防止短时间滥用。
- 配额：控制套餐每月可用量和成本。

阶段 0 必须实现基础 rate-limit middleware：

| 限制 | 数值 |
|---|---|
| 每用户普通 API | ≤ 100 req/min |
| 全局 IP | ≤ 1000 req/min |

阶段 0 单机 PM2 形态下，rate-limit 存储后端采用进程内内存 token bucket。因为 API 进程初期只有 1 个实例，不引入 Redis。若未来 API 多实例部署，再切换为 Redis / Upstash / Postgres-backed rate limiter。

阶段 1 在 `POST /api/grade` 增加 LLM 专用限制：

| 限制 | 数值 |
|---|---|
| LLM 批改 | ≤ 10/min/user |
| LLM 批改 | ≤ 100/day/user |

每日限制可以通过 DB 查询或单独 rate-limit 记录实现；月度用量通过 `monthly_quotas` 记录。

### 4.5 存储与隐私

存储采用 provider 抽象：

- dev / test：local provider。
- staging / production：默认 Supabase Storage。

Supabase region 优先选择香港或新加坡。

图片要求：

- 支持 jpg / png / webp / heic。
- 单文件不超过 10MB。
- 服务端 MIME 校验。
- 使用 sharp 清理 EXIF / GPS 等元数据。
- 文件 key 以 `organizationId` 开头。

阶段 0 上传链路统一走 backend 接收文件：

```text
browser
  -> POST /api/upload multipart
  -> backend MIME / size 校验
  -> sharp strip EXIF
  -> storage.upload(buffer, key)
  -> 返回 key
```

后续如需要前端直传 signed URL，再单独设计 finalize / clean 流程。

### 4.6 LLM 调用

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
- 阶段 1 增加单次调用成本熔断，默认建议：单次 token > 8k 或成本 > $0.20 时 fail + 记录告警。

---

## 五、阶段 0：基础设施与端到端空链路

建议周期：3-4 周。

目标：先证明系统从登录到 worker 写回状态可以跑通。

阶段 0 拆为 0a / 0b。

### 5.1 阶段 0a：Monorepo、Auth、多租户底座

主要任务：

1. 初始化 pnpm monorepo。
2. 建立 Node 20.9+、TypeScript strict、ESLint、Prettier、Vitest、Playwright。
3. 创建 `packages/config`、`packages/types`、`packages/logger`。
4. 创建 `packages/db`：
   - Drizzle client
   - schema
   - migration workflow
   - `scopedDb(organizationId)`
5. 创建 Drizzle schema：
   - Better-Auth tables
   - organizations
   - members
   - invitations
   - students
   - exam_papers
   - grading_records
   - mistake_collection
   - monthly_quotas
6. `organizations` 表必须包含正式列：
   - `isPersonal boolean not null default false`
   - `subscriptionTier enum('free','basic','pro','plus') not null default 'free'`
   - `monthlyQuota integer not null default 50`
7. `monthly_quotas` 表使用复合主键：
   - `(organizationId, yearMonth)`
   - `gradingsUsed`
   - `tokensUsed`
   - `costCents`
   - `updatedAt`
8. 创建 `packages/auth`：
   - Better-Auth server config
   - Better-Auth client export
   - personal organization 创建 hook
9. 创建 `packages/email`：
   - dev console transport 或 Mailpit
   - prod Resend transport
10. 创建 `apps/backend`：
   - Hono app
   - `src/http.ts`
   - `src/worker.ts`
   - `src/boss.ts`
   - health route
   - Better-Auth handler 挂载到 `/api/auth/*`
   - session middleware
   - require-org middleware
   - rate-limit middleware
11. `require-org` middleware：
   - 未登录返回 401
   - 不属于 active organization 返回 403
   - active org 缺失时回退 personal org 或返回明确错误
12. 创建 `apps/web`：
   - Next.js 16
   - Chakra UI
   - 登录 / 注册页面
   - Dashboard shell
   - `apiServer`
   - `/api/*` rewrites
13. 实现 `no-raw-db` ESLint 规则，阶段 0 立即强制。
14. 实现学生 CRUD：
   - 创建
   - 编辑
   - archived 软删除
   - 搜索
   - 筛选
   - 备注

阶段 0a 验收：

- `POST /api/auth/sign-up/email` 命中 backend。
- 注册后自动创建 personal organization。
- 新 personal org 默认 `subscriptionTier='free'`、`monthlyQuota=50`、`isPersonal=true`。
- 登录后可以进入 Dashboard。
- `apps/web` 不存在 Better-Auth route handler。
- 可以创建、编辑、删除、搜索学生。
- Org A 不能读取 Org B 学生。
- 业务代码直接 import raw `db` 会被 lint 拦截。

### 5.2 阶段 0b：上传、队列、worker 空链路

主要任务：

1. 创建 `packages/storage`：
   - `StorageProvider` interface
   - local provider
   - Supabase provider skeleton
2. 实现 backend 上传：
   - `POST /api/upload`
   - multipart 接收
   - MIME 校验
   - 10MB 限制
   - sharp EXIF strip
   - key 生成
   - storage 写入
3. 创建 `packages/ai` 骨架：
   - client config
   - subject enum
   - schema placeholder
   - prompt placeholder
4. 创建 `packages/jobs`：
   - job payload schema
   - `gradeExamJobHandler` 空实现
5. 实现 `apps/backend/src/boss.ts`：
   - PgBoss client
   - `sendJob`
   - 不调用 `boss.start()`
6. 实现 `POST /api/grade`：
   - session 校验
   - organization 校验
   - quota 校验
   - 创建 grading record
   - `sendJob('grade-exam', { gradingId, organizationId })`
7. 实现 `apps/backend/src/worker.ts`：
   - 唯一调用 `boss.start()`
   - 注册测试 job
   - pending -> processing -> completed
8. 实现 `GET /api/grade/:id/status`。
9. 建立 worker 多租户负向测试：
   - 伪造 organizationId job payload
   - worker 拒绝处理
   - `grading_records.status` 仍为 pending
   - grading record 其他字段不被写入
10. 建立 storage 多租户负向测试：
   - 跨 org 读取 storage key 必须 403
11. 建立 PM2 三进程配置：
   - `teacher-score-web`
   - `teacher-score-api`
   - `teacher-score-worker`
12. staging 形态至少跑通一次。

阶段 0b 验收：

- 可以上传图片。
- 上传图片完成 MIME 校验和 EXIF 清洗。
- 文件 key 以 organizationId 开头。
- 可以创建 grading record。
- worker 能消费测试 job 并写回 completed。
- 前端可以通过轮询看到 completed。
- 伪造 organizationId 的 worker job 不会修改 grading record。
- `lint`、`test`、`build` 通过。
- staging 环境验证 web/api/worker 三进程和 Nginx `/api/*` 分流。

---

## 六、阶段 1：数学 + 英语核心闭环

建议周期：4-5 周。

目标：让数学和英语两科达到可被种子老师真实测试的水平。

阶段 1 拆为 1a / 1b。

### 6.1 阶段 1a：数学闭环 + 5 个种子老师

主要任务：

1. 收集数学至少 20 张真实试卷 fixture。
2. 为数学 fixture 标注期望答案。
3. 建立 `scripts/accuracy-test.ts`。
4. 实现 `packages/ai`：
   - OpenAI-compatible client
   - runtime model config
   - Zod schemas
   - base prompt
   - math prompt
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
6. 设置 worker 并发上限，默认 `teamSize=2`，并放入配置。
7. 设置单次批改成本熔断。
8. `POST /api/grade` 增加 LLM 专用限流：
   - ≤ 10/min/user
   - ≤ 100/day/user
9. 创建 `packages/analytics`：
   - PostHog server/client wrapper
   - 未配置 key 时静默禁用
10. 前端批改入口：
   - 选择学生
   - 选择学科
   - 上传文件
   - 电脑摄像头拍照
   - 提交批改
11. 前端进度页：
   - 3 秒轮询
   - completed / failed 停止
   - 90 秒提示
12. 结果审核页：
   - 总分
   - 正确率
   - 错题数
   - 单题详情
   - 置信度标注
   - 字迹不清提示
   - 改分
   - 单题评语
   - 整卷评语
13. Dashboard 展示本月配额。
14. 配额超限阻止新批改。
15. Pino redact。
16. Sentry / PostHog 可配置，未配置时静默禁用。

阶段 1a 验收：

- 数学客观题初始准确率达到 85% 以上。
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
- Chrome / Edge / Safari 最近 2 个版本可用。
- getUserMedia 不可用时回退文件上传。
- iOS Safari 15+ 上传入口可用。
- 至少 5 个种子老师可真实试用数学闭环。

### 6.2 阶段 1b：英语加入 + 30 个种子老师

主要任务：

1. 收集英语至少 20 张真实试卷 fixture。
2. 为英语 fixture 标注期望答案。
3. 新增 english prompt。
4. 准确率测试支持 math + english。
5. 结果审核页补足英语题型展示。
6. 历次成绩列表。
7. 错题自动归集数据写入。
8. 基础种子老师运营数据埋点：
   - user_signed_up
   - student_created
   - grading_started
   - grading_completed
   - grading_score_modified
   - quota_exceeded

阶段 1b 验收：

- 英语客观题初始准确率达到 85% 以上。
- 数学、英语 prompt 更新导致对应学科准确率衰退超过 5% 时阻断发布。
- 高置信度题老师改分率进入可接受区间。
- 30 个种子老师可进入试用。
- 可以开始观察 W4 留存。

---

## 七、阶段 2：语文 + 物理 + 化学扩科

建议周期：4-6 周。

目标：补齐完整 5 科，但按准确率门槛放量。

主要任务：

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

阶段 2 验收：

- 5 科均可完整走批改闭环。
- 阶段 2 完成后才对外宣称完整 5 科可用。
- 每科 prompt/schema 变更时跑对应学科 fixture。
- 准确率衰退超过 5% 不允许发布。

---

## 八、阶段 3：模板、错题本、学情、PDF

建议周期：4-5 周。

目标：从批改工具升级为学情资产工具。

主要任务：

1. 初始化 `packages/pdf`。
2. 保存为模板：
   - 从批改结果保存识别结果
   - 一键创建模板
3. 模板审核 / 编辑：
   - 题干
   - 正确答案
   - 分值
   - 知识点标签
4. 使用模板批改：
   - 不重复识别题目
   - 直接对照答案判分
5. 试卷库：
   - 列表
   - 学科 / 年级筛选
   - 重命名
   - 删除
   - 复制
6. 错题本 UI：
   - 自动去重归集
   - 列表
   - 搜索
   - 按知识点排序
   - 按时间排序
   - 按重复次数排序
   - 标记已掌握
7. 学情：
   - 历次成绩增强
   - 知识点热力图
   - 进步曲线
8. PDF：
   - 批改报告导出
   - 错题导出
   - `generate-pdf` 异步 job

阶段 3 验收：

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

## 九、阶段 4：增强能力与商业化

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

## 十、测试策略

### 10.1 单元测试

目标：

- 工具函数覆盖率不低于 80%。
- `scopedDb` 覆盖率不低于 90%。
- AI schema / compare / scoring helper 尽量 100%。

### 10.2 集成测试

必须覆盖：

- 注册 -> personal organization 创建。
- personal org 默认 free + monthlyQuota 50。
- 登录 -> session 获取。
- Org A 不能访问 Org B 学生。
- 跨 org 读取 storage key 返回 403。
- 上传 -> storage key 写入。
- grade -> 入队 -> worker -> status completed。
- worker organizationId 不匹配必须失败。
- worker 拒绝伪造 job 时 grading record 不被修改。

### 10.3 E2E 测试

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

### 10.4 准确率测试

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
- 全量回归通过手动 workflow 或夜间任务运行。
- prompt/schema 变更准确率衰退超过 5% 阻断发布。

建议 GitHub Actions 后续拆分：

```text
.github/workflows/ci.yml
.github/workflows/accuracy-changed-subjects.yml
.github/workflows/accuracy-nightly.yml
```

---

## 十一、部署计划

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

数据与存储：

- Supabase Postgres 云托管。
- Supabase region 优先香港或新加坡。
- production storage 默认 Supabase Storage。
- dev/test 可用 local storage。

阶段 0 完成时必须至少验证一次 staging 形态，避免阶段 1 才发现 Cookie、rewrites、Nginx、PM2 进程边界问题。

---

## 十二、文档同步计划

阶段 0 收尾时必须同步修订 `ARCHITECTURE.md` 中的旧内容：

1. `apps/web + apps/worker` 改为 `apps/web + apps/backend`。
2. Next Route Handlers 承载业务 API 改为 Hono backend。
3. Better-Auth server handler 移到 backend。
4. Supabase Realtime 改为轮询。
5. `apps/worker` 改为 `apps/backend/src/worker.ts`。
6. `subscriptionTier/monthlyQuota/isPersonal` 从 JSONB metadata 改为正式列。
7. PM2 两进程改为三进程。
8. worker payload 必须带 `organizationId`。
9. API 限流、LLM 限流、上传清洗、storage 多租户读取校验写入架构文档。

---

## 十三、双方一致意见

Codex 与 Claude Code 最终一致同意：

1. 本计划符合 `FINAL_IMPLEMENTATION_DECISION.md`。
2. 阶段 0 必须先做硬架构底座，不追求页面丰富。
3. API 限流、LLM 限流、多租户隔离、Better-Auth backend 边界、worker org 双校验是阶段 0/1 的硬验收。
4. 数学和英语先打磨，语文/物理/化学在阶段 2 扩科。
5. `ARCHITECTURE.md` 的旧草案内容必须在阶段 0 收尾时修订，避免后续实现被误导。

Claude Code 二轮最终结论：

> 同意。Codex 可以基于以上修订直接落最终 DEVELOPMENT_PLAN.md，无阻塞项。
