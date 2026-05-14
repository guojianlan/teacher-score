# 最终实施决策 — 教师 LLM 批改 SaaS

> 日期：2026-05-13  
> 状态：最终执行版  
> Leader：Codex  
> 协作评审：Claude Code  
> 适用范围：后续项目启动、目录初始化、架构落地、开发排期

---

## 一、最终结论

本项目可以开发实施，但不再按原文档中的“三个月压缩 MVP”执行。用户已经接受交付时间后移，因此最终方案保留完整 5 科目标：数学、英语、语文、物理、化学。

最终架构采用：

```text
apps/web      = Next.js 16 Web App 层，保留 SSR/RSC/SSG/ISR/CSR 能力
apps/backend  = Hono 后端应用，包含 HTTP API 入口和 Worker 入口
packages/*    = 可复用库，不承载独立进程生命周期
```

核心拍板：

- 保留完整 5 科，但必须分阶段上线，每科有 fixture 准确率门槛。
- 采用 `apps/web + apps/backend`，不再采用原文档的 `apps/web + apps/worker`。
- `apps/backend` 使用 Hono，不使用 NestJS。
- Worker 进程不放入 `packages`；Worker 的可复用业务逻辑放入 `packages/jobs`。
- 所有业务 REST API 放在 `apps/backend`；`apps/web` 负责页面、布局、交互、SSR/RSC/SSG/ISR/CSR 和静态资源，业务数据统一通过 backend API 访问。
- 批改进度当前核心阶段使用轮询，不使用 Supabase Realtime。

---

## 二、为什么改成 apps/web + apps/backend

原方案是：

```text
apps/web
apps/worker
```

这个方案简单，但随着用户确认保留完整 5 科和完整产品能力，后端会承担更多长期职责：

- REST API
- 认证回调
- 上传签名和本地上传回调
- LLM 调用
- pg-boss 入队和消费
- PDF 生成
- 配额、成本、准确率记录
- 未来手机端、机构端、第三方接口复用

因此最终采用独立后端应用更合理：

```text
apps/web
apps/backend
```

`apps/backend` 是一个 app/package，但有两个启动入口：

```text
apps/backend/src/http.ts    # 启动 Hono HTTP API
apps/backend/src/worker.ts  # 启动 pg-boss worker consumer
```

部署时，同一个 `apps/backend` 可以跑成两个进程：

```text
teacher-score-api
teacher-score-worker
```

这样既满足前后端分离，也避免把 worker 进程放进 `packages` 造成语义混乱。

---

## 三、worker 能不能放 packages

结论：**进程不放 packages，任务逻辑可以放 packages。**

不能放入 `packages` 的部分：

- `boss.start()`
- HTTP server listen
- SIGTERM/SIGINT 优雅关闭
- PM2/部署入口
- runtime env loading

这些都属于“可启动进程”的职责，必须放在 `apps/backend`。

可以放入 `packages/jobs` 的部分：

- `gradeExamJobHandler`
- `generatePdfJobHandler`
- `extractTemplateJobHandler`
- `cleanupOrphanFilesJobHandler`
- 错题归集逻辑
- 配额扣减逻辑
- job payload schema

推荐边界：

```text
apps/backend/src/worker.ts
  负责启动 pg-boss、注册 job、管理进程生命周期

packages/jobs/src/grade-exam.ts
  负责纯业务处理：读记录、拿图、调 AI、写结果、写错题、扣配额
```

---

## 四、为什么选 Hono 而不是 NestJS

最终选择：**Hono**。

理由：

| 维度 | Hono | NestJS | 本项目判断 |
|---|---|---|---|
| 复杂度 | 轻量 | 重 | 单人/小团队优先轻量 |
| 类型风格 | 函数式、直接 | decorator + DI | 当前 monorepo 已靠 packages 分层，不需要 Nest 额外框架约束 |
| 启动速度 | 快 | 较慢 | 后端和 worker 都需要快速启动 |
| 与 packages 整合 | 直接 import | 需要 Provider/Module 包装 | Hono 摩擦更小 |
| 长期扩展 | 足够 | 很强但偏重 | 这个项目不是大型企业后端团队 |

NestJS 的优势是大型团队规范、复杂 DI、模块化治理。但本项目已有明确边界：`apps/backend` 负责服务入口，`packages/*` 负责领域能力。再引入 NestJS 会增加样板和学习成本。

---

## 五、最终 Monorepo 结构

```text
teacher-score-application/
├── apps/
│   ├── web/
│   │   ├── next.config.mjs
│   │   ├── package.json
│   │   └── src/
│   │       ├── app/
│   │       │   ├── (auth)/
│   │       │   ├── (app)/
│   │       │   └── api/
│   │       │       └── health/route.ts
│   │       ├── components/
│   │       ├── hooks/
│   │       └── lib/
│   │           ├── api-client.ts
│   │           └── api-server.ts
│   │
│   └── backend/
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── http.ts
│           ├── worker.ts
│           ├── app.ts
│           ├── boss.ts
│           ├── routes/
│           │   ├── auth.ts
│           │   ├── students.ts
│           │   ├── papers.ts
│           │   ├── grade.ts
│           │   ├── upload.ts
│           │   ├── mistakes.ts
│           │   └── quotas.ts
│           └── middleware/
│               ├── session.ts
│               ├── require-org.ts
│               └── quota.ts
│
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
│
├── docs/
│   └── claude/
├── scripts/
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── ecosystem.config.js
```

---

## 六、服务职责边界

| 职责 | 归属 |
|---|---|
| 页面路由、SSR、RSC、SSG、ISR、CSR、静态资源 | `apps/web` |
| 登录/注册页面 UI | `apps/web` |
| Better-Auth server handler | `apps/backend` |
| OAuth callback | `apps/backend` |
| 业务 REST API | `apps/backend` |
| 上传签名、本地上传回调 | `apps/backend` |
| pg-boss job 入队 | `apps/backend/src/routes/grade.ts` |
| pg-boss job 消费 | `apps/backend/src/worker.ts` |
| LLM 调用编排 | `packages/jobs` 调用 `packages/ai` |
| AI client 和 5 科 prompt | `packages/ai` |
| PDF 生成 | `packages/pdf` |
| Drizzle schema、migration、scopedDb | `packages/db` |
| Better-Auth 配置和 client/server exports | `packages/auth` |
| 文件存储抽象 | `packages/storage` |
| 类型定义 | `packages/types` |

---

## 七、认证与 Cookie 决策

Better-Auth 必须完整运行在 `apps/backend`。

```text
apps/backend
  /api/auth/*
```

`apps/web` 不再承载 Better-Auth route handler，只保留登录/注册 UI，通过 `/api/auth/*` 调用后端。

原因：

- OAuth callback 只能有一个明确服务处理。
- session cookie、session DB 写入、后端 API 鉴权必须在同一套 auth server 语义下。
- 避免 Next.js 和 Hono 各跑一部分 auth 逻辑造成维护混乱。

`apps/web` 的 RSC/Server Components 调 backend API 时，必须统一转发 Cookie。

推荐封装：

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

浏览器端 Client Components 统一通过 `/api/*` 调用，由同源代理保证 cookie 自动携带。

---

## 八、本地开发与生产代理

本地开发建议：

```text
apps/web      http://localhost:3000
apps/backend  http://localhost:3001
```

浏览器永远请求 `localhost:3000/api/*`，由 Next.js rewrites 代理到 Hono，避免跨端口 Cookie/CORS 问题。

```javascript
// apps/web/next.config.mjs
const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.BACKEND_INTERNAL_URL ?? 'http://localhost:3001'}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
```

生产环境由 Nginx 做同域分流：

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:3001;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
}

location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
}
```

这样生产环境没有 CORS 问题，Cookie 也保持同域。

---

## 九、pg-boss 与 Worker 决策

`apps/backend/src/http.ts` 不调用 `boss.start()`。

`apps/backend/src/worker.ts` 是唯一调用 `boss.start()` 的入口。

HTTP API 入队时只创建 job，不启动 worker。

每个 job payload 必须携带 `organizationId`：

```typescript
type GradeExamJobPayload = {
  gradingId: string;
  organizationId: string;
};
```

Worker 查询必须同时校验：

```typescript
WHERE grading_records.id = $gradingId
  AND grading_records.organization_id = $organizationId
```

这是多租户安全红线。

---

## 十、多租户与数据模型修正

继续采用 organization 作为租户单位。

必须修正：

1. 所有业务表包含 `organizationId` 并建立 index。
2. Web/API 层业务查询必须走 `scopedDb(organizationId)` 或同等封装。
3. Worker job 必须携带 `organizationId` 并在查询时二次校验。
4. `subscriptionTier`、`monthlyQuota`、`isPersonal` 不放 JSONB，必须提升为正式列。

推荐 organization 字段：

```typescript
export const organizations = pgTable('organizations', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  logo: text('logo'),
  isPersonal: boolean('is_personal').notNull().default(false),
  subscriptionTier: text('subscription_tier', {
    enum: ['free', 'basic', 'pro', 'plus'],
  }).notNull().default('free'),
  monthlyQuota: integer('monthly_quota').notNull().default(50),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
```

---

## 十一、批改进度方案

V1 不使用 Supabase Realtime。

原因：

- 原文档不使用 Postgres RLS。
- Supabase Realtime 的安全模型依赖 RLS 或额外授权策略。
- 批改任务一般在 60-90 秒内完成，轮询体验足够。

最终方案：

```text
POST /api/grade
  返回 gradingId

GET /api/grade/:id/status
  前端每 3 秒轮询
  completed/failed 后停止
  90 秒未完成提示用户稍后刷新
```

V2 如需更强实时体验，再考虑 SSE 或 WebSocket，不优先引入 Supabase Realtime。

---

## 十二、完整 5 科实施阶段

因为交付时间已经允许后移，最终保留完整 5 科，但必须分阶段推进。

### 阶段 0：基础设施

建议周期：3-4 周

目标：

- 初始化 monorepo。
- 建立 `apps/web`、`apps/backend`。
- 建立 `packages/db/auth/types/config/logger/storage/ai/jobs`。
- 跑通认证、学生 CRUD、上传、入队、worker 消费的空链路。

交付物：

- 用户可以注册登录。
- 可以创建学生。
- 可以上传图片。
- 可以创建 grading record。
- worker 能消费测试 job 并写回状态。

### 阶段 1：数学 + 英语核心闭环

建议周期：4-5 周

目标：

- 数学、英语各收集至少 20 张真实试卷 fixture。
- 建立准确率测试脚本。
- 打通 LLM 批改、结果展示、人工改分、置信度标注。
- 先让两科达到可被种子老师测试的水平。

门槛：

- 客观题准确率达到约 85% 以上。
- 高置信度题老师改分率进入可接受区间。
- prompt 更新时准确率衰退超过 5% 不允许发布。

### 阶段 2：语文 + 物理 + 化学

建议周期：4-6 周

目标：

- 每科至少 20 张真实试卷 fixture。
- 语文重点处理古诗默写、阅读题、作文只做建议分。
- 物理重点处理单位、公式、有效数字。
- 化学重点处理方程式、配平、上下标、实验题表达。
- 5 科进入统一准确率回归。

交付物：

- 5 科均可批改。
- 弱科可标注 beta，但不能隐藏在“完整学科”目标之外。

### 阶段 3：模板、错题本、学情、PDF

建议周期：4-5 周

目标：

- 简化模板：保存识别结果并复用答案判分。
- 模板编辑器先做必要字段，不追求复杂题库系统。
- 错题本 UI：列表、筛选、标记已掌握。
- 学情：历次成绩、基础趋势、知识点统计。
- PDF：批改报告和错题导出。

### 阶段 4：增强能力

建议周期：按种子用户反馈排序

候选：

- 手机扫码拍照联动。
- 区域框选。
- 多页试卷合并。
- 订阅支付。
- 家长分享链接。
- 机构管理。

---

## 十三、部署进程

PM2 可配置三个进程：

```javascript
module.exports = {
  apps: [
    {
      name: 'teacher-score-web',
      cwd: './apps/web',
      script: '.next/standalone/server.js',
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
        BACKEND_INTERNAL_URL: 'http://127.0.0.1:3001',
      },
    },
    {
      name: 'teacher-score-api',
      cwd: './apps/backend',
      script: 'dist/http.js',
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
    },
    {
      name: 'teacher-score-worker',
      cwd: './apps/backend',
      script: 'dist/worker.js',
      env_production: {
        NODE_ENV: 'production',
      },
    },
  ],
};
```

---

## 十四、开发前必须更新的原文档点

如果后续继续维护 `ARCHITECTURE.md`、`REQUIREMENTS.md`、`PRODUCT.md`，以下内容必须同步：

1. `apps/web + apps/worker` 改为 `apps/web + apps/backend`。
2. `apps/backend` 使用 Hono，包含 HTTP API 和 Worker 两个入口。
3. `packages/jobs` 新增为纯任务业务逻辑包。
4. `Better-Auth` server handler 移到 backend。
5. `Supabase Realtime` 改为轮询。
6. `subscriptionTier/monthlyQuota/isPersonal` 从 JSONB metadata 改为正式列。
7. V1 工期不再写 3 个月；改为分阶段完整 5 科。
8. Worker job payload 必须带 `organizationId`。

---

## 十五、最终执行原则

1. 先跑通完整链路，再扩学科和功能。
2. 每科上线前必须有 fixture 和准确率回归。
3. API 统一在 backend，web 不散落业务 API。
4. 可启动进程只放 apps，不放 packages。
5. 多租户隔离是 P0，不为开发速度让步。
6. 完整 5 科可以保留，但必须用阶段门槛管理。
