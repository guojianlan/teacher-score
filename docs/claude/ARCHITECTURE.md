# 技术架构文档 — 教师 LLM 批改 SaaS

> 版本：v1.0  
> 日期：2026-05-13  
> 关联文档：[PRODUCT.md](./PRODUCT.md)、[REQUIREMENTS.md](./REQUIREMENTS.md)

> **执行说明（2026-05-13 更新）**：本文是原始架构草案。Codex 与 Claude Code 后续已根据用户新的时间与架构约束形成最终执行版：[`FINAL_IMPLEMENTATION_DECISION.md`](./FINAL_IMPLEMENTATION_DECISION.md)。若本文中的 `apps/web + apps/worker`、三个月 V1、Supabase Realtime、organization metadata JSONB 等内容与最终执行版冲突，以最终执行版为准。

> ⚠️ **冲突项清单（2026-05-13 第二次更新）**：以下条目如出现在本文，请视为已废弃，不要据此实现：
>
> 1. `apps/web + apps/worker` 双 app 形态 → 改为 `apps/web + apps/backend`，backend 内部 `http.ts` / `worker.ts` 两进程入口。
> 2. 业务 REST API 放在 `apps/web` Route Handlers → 统一移至 backend `/api/*`。
> 3. Better-Auth handler 挂在 `apps/web` → 只挂在 backend `/api/auth/*`。
> 4. Route Handler 顶层 `boss.start()` / 注册 worker handler → 现 `apps/backend/src/boss.ts` 只导出 producer；`worker.ts` 是唯一启动 consumer 的入口。
> 5. Supabase Realtime 作为批改进度通道 → 阶段 0/1 统一使用前端 3 秒轮询。
> 6. `subscriptionTier` / `monthlyQuota` / `isPersonal` 放在 organization JSONB metadata → 现已建为顶级列。
> 7. 前端 signed URL 直传 → 阶段 0 统一走 backend multipart 上传 + sharp 清理 EXIF/GPS。
> 8. PM2 两进程 web/worker → 三进程 web/api/worker，见根目录 `ecosystem.config.cjs`。
>
> 仓库实际结构、已落地的红线、与未完成清单见根目录 `README.md` 与 [`DEFERRED.md`](./DEFERRED.md)。

---

## 目录

1. [技术栈总览](#一技术栈总览)
2. [系统架构图](#二系统架构图)
3. [Monorepo 目录结构](#三monorepo-目录结构)
4. [数据模型](#四数据模型)
5. [多租户隔离方案](#五多租户隔离方案)
6. [AI 集成方案](#六ai-集成方案)
7. [任务队列与异步流程](#七任务队列与异步流程)
8. [文件存储方案](#八文件存储方案)
9. [认证与授权](#九认证与授权)
10. [部署架构](#十部署架构)
11. [监控、日志与埋点](#十一监控日志与埋点)
12. [配置与环境变量](#十二配置与环境变量)
13. [开发工作流](#十三开发工作流)
14. [风险与兜底方案](#十四风险与兜底方案)

---

## 一、技术栈总览

| 层 | 选型 | 版本 | 说明 |
|---|---|---|---|
| Framework | Next.js | 16.x | App Router + Turbopack |
| 语言 | TypeScript | 5.x | strict mode |
| Runtime | Node.js | 20.9+ | Next.js 16 要求 |
| 包管理 | pnpm | 9.x | workspace 协议 |
| Monorepo 工具 | pnpm workspaces | - | 不引入 Turborepo（单人项目） |
| UI 框架 | Chakra UI | v3.x | 用户指定 |
| 状态管理 | TanStack Query + Zustand | latest | 服务端态 / 客户端态分离 |
| 表单 | React Hook Form + Zod | latest | Schema 复用 AI SDK 验证 |
| Auth | Better-Auth | 1.x | + organization 插件 |
| ORM | Drizzle ORM | latest | drizzle-kit migration |
| DB | Supabase Postgres | - | 云托管 |
| File Storage | Provider 抽象 | - | Local + Supabase Storage 双实现 |
| Realtime | Supabase Realtime | - | row-level 订阅 |
| 任务队列 | pg-boss | 10.x | 基于 Postgres |
| AI SDK | Vercel AI SDK | latest | `ai` + `@ai-sdk/openai` |
| LLM 模型 | GPT-5.5（多模态） | - | 通过 OpenAI 兼容 API |
| 图片处理 | sharp | latest | 服务端压缩 |
| PDF 生成 | @react-pdf/renderer | latest | 批改报告 |
| Logger | Pino | latest | + pino-pretty (dev) |
| Error Monitoring | Sentry | latest | @sentry/nextjs |
| Analytics | PostHog | latest | posthog-js + posthog-node |
| Email | Resend | latest | 注册 / 密码重置 |
| 部署 | Git pull + pnpm build + PM2 | - | standalone output |
| 反向代理 | Nginx | - | HTTPS + 静态文件 |
| 测试 | Vitest + Playwright | latest | unit + e2e |
| Lint | ESLint + Prettier | latest | flat config |
| Git Hooks | Husky + lint-staged | latest | pre-commit |

---

## 二、系统架构图

```
┌──────────────────────────────────────────────────────────────────────┐
│                       客户端（浏览器 / 手机 H5）                       │
│  ┌──────────────────────┐   ┌──────────────────────────┐             │
│  │  电脑端 React SPA      │   │  手机 H5 拍照页            │             │
│  │  (Chakra UI v3)       │←─→│  /m/upload/[token]       │             │
│  │  getUserMedia 摄像头   │   │  调用 input file capture │             │
│  └──────────────────────┘   └──────────────────────────┘             │
└─────────────────────────┬────────────────────────────────────────────┘
                          │ HTTPS
                          ▼
┌──────────────────────────────────────────────────────────────────────┐
│  Nginx 反向代理（443 → 3000）                                          │
│  └─ TLS / 静态文件缓存 / gzip                                          │
└─────────────────────────┬────────────────────────────────────────────┘
                          ▼
┌──────────────────────────────────────────────────────────────────────┐
│  PM2 进程组                                                           │
│  ┌────────────────────────────────────┐  ┌─────────────────────────┐ │
│  │  apps/web  (Next.js 16 standalone) │  │  apps/worker (pg-boss)  │ │
│  │  ─ App Router (RSC + Server Action)│  │  ─ 消费批改任务          │ │
│  │  ─ Route Handlers /api/*           │  │  ─ 调 LLM + 写结果      │ │
│  │  ─ Better-Auth                     │  │  ─ 失败重试             │ │
│  │  ─ 入队 / 查询 / 实时订阅            │  │                          │ │
│  └─────────────┬──────────────────────┘  └────────────┬────────────┘ │
└────────────────┼─────────────────────────────────────┼───────────────┘
                 │                                     │
                 ▼                                     ▼
       ┌─────────────────────┐              ┌──────────────────────────┐
       │   Supabase           │              │  OpenAI GPT-5.5（代理）   │
       │   ├─ Postgres        │              │  通过本地代理 baseURL     │
       │   │  ├─ Drizzle 业务表 │              └──────────────────────────┘
       │   │  ├─ Better-Auth 表│
       │   │  └─ pg-boss 任务表 │
       │   ├─ Realtime         │
       │   └─ Storage（可选）   │              ┌──────────────────────────┐
       └─────────────────────┘              │  Resend (邮件)            │
                                            │  PostHog Cloud (埋点)     │
                                            │  Sentry (错误监控)        │
                                            └──────────────────────────┘
```

### 核心数据流

**批改流程数据流**：

```
1. 用户拍照
   └─ apps/web 拿到 File 对象
2. 前端请求签名 URL
   └─ POST /api/upload/sign → 返回 Storage signed URL
3. 前端直传 Storage
   └─ PUT signed URL（不经服务器，省带宽）
4. 前端通知后端
   └─ POST /api/grade { studentId, paperImageUrls, examPaperId? }
5. 服务端写表 + 入队
   └─ insert grading_records(status='pending')
   └─ pgBoss.send('grade-exam', { gradingId })
   └─ return { gradingId }（立即响应）
6. Worker 消费任务
   └─ 读 grading_records → 读图 → 调 LLM → generateObject
   └─ update grading_records(status='completed', results=...)
   └─ insert mistake_collection (errors)
7. 前端实时订阅
   └─ Supabase Realtime channel: grading:{gradingId}
   └─ 收到 status=completed → 跳转结果页
```

---

## 三、Monorepo 目录结构

### 3.1 顶层结构

```
teacher-score-application/
├── .github/
│   └── workflows/
│       └── ci.yml                    # 单测 + lint（部署手动）
├── apps/
│   ├── web/                          # Next.js 16 应用
│   └── worker/                       # pg-boss 任务消费者
├── packages/
│   ├── db/                           # Drizzle schema + scopedDb
│   ├── auth/                         # Better-Auth 配置
│   ├── ai/                           # AI SDK + grader + prompts
│   ├── storage/                      # Storage Provider 抽象
│   ├── logger/                       # Pino + Sentry transport
│   ├── analytics/                    # PostHog 封装
│   ├── email/                        # Resend 封装
│   ├── types/                        # 跨包共享类型
│   ├── config/                       # 共享 ESLint / TS / Prettier
│   └── ui/                           # [可选] 跨 app 共享 UI 组件
├── docs/
│   └── claude/
│       ├── PRODUCT.md
│       ├── REQUIREMENTS.md
│       └── ARCHITECTURE.md
├── scripts/
│   ├── db-seed.ts                    # 种子数据
│   └── accuracy-test.ts              # 准确率回归测试
├── .env.example
├── .gitignore
├── .nvmrc                            # Node 20.9+
├── ecosystem.config.js               # PM2 配置
├── package.json                      # workspace root
├── pnpm-workspace.yaml
├── tsconfig.base.json                # 基础 TS 配置
├── README.md
└── CHANGELOG.md
```

### 3.2 `pnpm-workspace.yaml`

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

### 3.3 `apps/web/` 详细结构

```
apps/web/
├── package.json
├── next.config.mjs                   # output: 'standalone', transpilePackages
├── tsconfig.json
├── tailwind.config.ts                # 如用 Tailwind（Chakra 不强依赖）
├── public/
│   ├── icons/
│   └── images/
├── src/
│   ├── app/
│   │   ├── layout.tsx                # 根布局 + ChakraProvider + Sentry init
│   │   ├── page.tsx                  # 着陆页
│   │   ├── (auth)/
│   │   │   ├── layout.tsx
│   │   │   ├── login/page.tsx
│   │   │   ├── register/page.tsx
│   │   │   └── reset-password/page.tsx
│   │   │
│   │   ├── (app)/                    # 登录后区域
│   │   │   ├── layout.tsx            # 侧边栏布局 + Org 切换器
│   │   │   ├── dashboard/page.tsx
│   │   │   ├── students/
│   │   │   │   ├── page.tsx
│   │   │   │   └── [id]/page.tsx
│   │   │   ├── grading/
│   │   │   │   ├── new/page.tsx      # 批改入口
│   │   │   │   ├── [id]/page.tsx     # 结果页
│   │   │   │   └── [id]/loading.tsx  # 处理中
│   │   │   ├── papers/
│   │   │   │   ├── page.tsx
│   │   │   │   └── [id]/page.tsx
│   │   │   ├── mistakes/page.tsx     # 错题本
│   │   │   └── settings/page.tsx
│   │   │
│   │   ├── m/                        # 手机 H5
│   │   │   └── upload/[token]/page.tsx
│   │   │
│   │   ├── api/
│   │   │   ├── auth/[...all]/route.ts        # Better-Auth handler
│   │   │   ├── upload/sign/route.ts          # 签名 URL
│   │   │   ├── grade/route.ts                # 触发批改
│   │   │   ├── m/upload-callback/route.ts    # 手机回调
│   │   │   ├── health/route.ts               # PM2 探活
│   │   │   └── webhooks/
│   │   │       └── stripe/route.ts           # V1.5
│   │   │
│   │   └── proxy.ts                  # Next 16 middleware 重命名
│   │
│   ├── components/
│   │   ├── ui/                       # Chakra 二次封装
│   │   │   ├── Button.tsx
│   │   │   ├── Input.tsx
│   │   │   └── ...
│   │   ├── camera/
│   │   │   ├── DesktopCamera.tsx
│   │   │   ├── PhoneScanLink.tsx
│   │   │   ├── ImageCropper.tsx
│   │   │   └── ImageUploader.tsx
│   │   ├── grading/
│   │   │   ├── GradingProgress.tsx
│   │   │   ├── ResultReviewer.tsx
│   │   │   ├── ScoreEditor.tsx
│   │   │   └── ConfidenceBadge.tsx
│   │   ├── paper/
│   │   │   ├── PaperList.tsx
│   │   │   └── PaperTemplateEditor.tsx
│   │   └── student/
│   │       ├── StudentList.tsx
│   │       ├── StudentForm.tsx
│   │       └── KnowledgeHeatmap.tsx  # V1.5
│   │
│   ├── actions/                      # Next.js Server Actions
│   │   ├── students.ts
│   │   ├── papers.ts
│   │   ├── grading.ts
│   │   ├── mistakes.ts
│   │   └── auth.ts                   # Wraps Better-Auth
│   │
│   ├── hooks/
│   │   ├── use-camera.ts
│   │   ├── use-realtime-grading.ts
│   │   └── use-organization.ts
│   │
│   ├── lib/
│   │   ├── auth-client.ts            # Better-Auth React client
│   │   ├── supabase-client.ts        # Supabase Realtime client
│   │   ├── posthog.ts                # PostHog 浏览器初始化
│   │   └── utils.ts
│   │
│   ├── theme/
│   │   └── index.ts                  # Chakra theme
│   │
│   └── instrumentation.ts            # Sentry init
```

### 3.4 `apps/worker/` 详细结构

```
apps/worker/
├── package.json
├── tsconfig.json                     # 编译到 ../../dist/worker
├── src/
│   ├── index.ts                      # 入口，启动 pg-boss
│   ├── jobs/
│   │   ├── grade-exam.ts             # 批改任务
│   │   ├── extract-template.ts       # 模板提取任务
│   │   ├── generate-pdf.ts           # PDF 导出任务
│   │   └── cleanup-orphan-files.ts   # 定时清理孤儿文件
│   └── lib/
│       ├── boss.ts                   # pg-boss 实例
│       └── shutdown.ts               # 优雅关闭
```

### 3.5 `packages/` 各包说明

**`packages/db`** — 数据库层
```
packages/db/
├── package.json
├── tsconfig.json
├── drizzle.config.ts
├── src/
│   ├── index.ts                      # export db, scopedDb, schema
│   ├── client.ts                     # Drizzle client 初始化
│   ├── schema/
│   │   ├── index.ts                  # re-export all
│   │   ├── auth.ts                   # Better-Auth 表
│   │   ├── organizations.ts          # Org 相关
│   │   ├── students.ts
│   │   ├── exam-papers.ts
│   │   ├── grading-records.ts
│   │   ├── mistake-collection.ts
│   │   └── quotas.ts                 # 配额追踪
│   ├── scoped.ts                     # scopedDb(orgId) 封装（核心安全机制）
│   └── queries/
│       ├── students.ts
│       ├── papers.ts
│       └── grading.ts
└── drizzle/                          # 自动生成的 migration
    └── 0000_initial.sql
```

**`packages/auth`** — 认证层
```
packages/auth/
├── src/
│   ├── index.ts                      # export auth instance
│   ├── server.ts                     # Better-Auth server config
│   ├── client.ts                     # React client setup
│   └── permissions.ts                # 自定义权限规则
```

**`packages/ai`** — AI 调用层
```
packages/ai/
├── src/
│   ├── index.ts
│   ├── client.ts                     # createOpenAI 自定义 baseURL
│   ├── grader.ts                     # 主判分函数
│   ├── template-extractor.ts         # 从批改记录沉淀模板
│   ├── schemas.ts                    # Zod schemas
│   └── prompts/
│       ├── base.ts                   # 通用 system prompt
│       ├── math.ts
│       ├── english.ts
│       ├── chinese.ts
│       ├── physics.ts
│       └── chemistry.ts
```

**`packages/storage`** — 文件存储抽象
```
packages/storage/
├── src/
│   ├── index.ts                      # export storage
│   ├── types.ts                      # StorageProvider 接口
│   ├── local.ts                      # 本地实现
│   ├── supabase.ts                   # Supabase Storage 实现
│   └── factory.ts                    # 根据 env 选实现
```

**`packages/logger`** — 日志
```
packages/logger/
├── src/
│   ├── index.ts                      # export logger
│   └── transports/
│       ├── pretty.ts                 # dev
│       └── sentry.ts                 # prod
```

**`packages/analytics`** — 埋点
```
packages/analytics/
├── src/
│   ├── index.ts                      # export track, identify
│   ├── server.ts                     # PostHog node client
│   └── client.ts                     # PostHog browser client
```

**`packages/email`** — 邮件
```
packages/email/
├── src/
│   ├── index.ts                      # sendEmail
│   ├── templates/
│   │   ├── welcome.tsx               # React Email 模板
│   │   ├── reset-password.tsx
│   │   └── grading-completed.tsx
```

**`packages/types`** — 共享类型
```
packages/types/
├── src/
│   ├── index.ts
│   ├── grading.ts                    # GradingJob, GradingResult
│   ├── question.ts                   # Question, QuestionResult
│   └── enums.ts                      # Subject, QuestionType, Role
```

**`packages/config`** — 共享配置
```
packages/config/
├── eslint/
│   └── base.js
├── typescript/
│   ├── base.json
│   ├── nextjs.json
│   └── node.json
└── prettier/
    └── base.js
```

### 3.6 包依赖关系

```
                  apps/web ────┐
                               ├──→ packages/auth ──┐
                  apps/worker ─┘                    │
                                                    ├──→ packages/db
                  apps/web ────┬──→ packages/ai ────┤
                  apps/worker ─┘                    │
                                                    ├──→ packages/storage
                  apps/web ────┬──→ packages/logger ┤
                  apps/worker ─┘                    │
                                                    └──→ packages/types
                  apps/web ────┬──→ packages/analytics
                  apps/worker ─┘
                  
                  apps/web ────→ packages/email
                  apps/worker ──→ packages/email
```

**铁律**：`packages/` 之间禁止循环依赖；`packages/` 不依赖 `apps/`。

---

## 四、数据模型

### 4.1 ER 图（核心实体）

```
┌──────────────────┐
│  organizations   │ ◄──┐
└──────┬───────────┘    │ owner
       │                │
       │ has many       │
       ▼                │
┌──────────────────┐    │
│ org_members      │ ───┘
│ (user_id,        │
│  org_id,         │
│  role)           │
└──────────────────┘
       ▲
       │
       │ user
       │
┌──────────────────┐
│ users (Better-Auth)│
└──────────────────┘

┌──────────────────┐
│  organizations   │
└──────┬───────────┘
       │ 1:N (orgId 多租户字段)
       ├──────────────────────────────────────────────────┐
       ▼                                                  │
┌──────────────────┐    ┌──────────────────┐             │
│   students       │    │  exam_papers      │             │
└──────┬───────────┘    └──────┬───────────┘             │
       │                       │                          │
       │ student               │ paper                    │
       │                       │                          │
       └─────────┬─────────────┘                          │
                 ▼                                         │
       ┌──────────────────┐                               │
       │ grading_records  │ ──→ generates mistakes        │
       └──────┬───────────┘                               │
              │                                            │
              ▼                                            │
       ┌──────────────────┐                               │
       │ mistake_collection│ ◄──────────────────────────┘
       └──────────────────┘
```

### 4.2 Drizzle Schema 完整定义

**`packages/db/src/schema/auth.ts`**（Better-Auth 必需表）：

```typescript
import { pgTable, text, timestamp, boolean } from 'drizzle-orm/pg-core';

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  activeOrganizationId: text('active_organization_id'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at'),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
```

**`packages/db/src/schema/organizations.ts`**：

```typescript
import { pgTable, text, timestamp, jsonb, primaryKey } from 'drizzle-orm/pg-core';
import { user } from './auth';

export const organization = pgTable('organization', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  logo: text('logo'),
  metadata: jsonb('metadata').$type<{
    isPersonal: boolean;      // 是否个人 org（注册自动创建的）
    subscriptionStatus: 'free' | 'basic' | 'pro' | 'plus';
    monthlyQuota: number;
  }>(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const member = pgTable('member', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  role: text('role', { enum: ['owner', 'admin', 'member'] }).notNull().default('member'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const invitation = pgTable('invitation', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  role: text('role', { enum: ['admin', 'member'] }).notNull().default('member'),
  status: text('status', { enum: ['pending', 'accepted', 'rejected', 'expired'] }).notNull().default('pending'),
  expiresAt: timestamp('expires_at').notNull(),
  inviterId: text('inviter_id').notNull().references(() => user.id),
});
```

**`packages/db/src/schema/students.ts`**：

```typescript
import { pgTable, uuid, text, jsonb, timestamp, index, boolean } from 'drizzle-orm/pg-core';
import { organization } from './organizations';
import { user } from './auth';

export const students = pgTable('students', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  primaryTeacherId: text('primary_teacher_id').references(() => user.id),  // 主要负责老师
  name: text('name').notNull(),
  grade: text('grade'),                  // "初一" "高二"
  subjects: jsonb('subjects').$type<string[]>().notNull().default([]),
  notes: text('notes'),
  archived: boolean('archived').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => ({
  orgIdx: index('students_org_idx').on(t.organizationId),
  teacherIdx: index('students_teacher_idx').on(t.primaryTeacherId),
}));
```

**`packages/db/src/schema/exam-papers.ts`**：

```typescript
import { pgTable, uuid, text, jsonb, timestamp, boolean, index } from 'drizzle-orm/pg-core';
import { organization } from './organizations';
import { user } from './auth';
import type { Question } from '@workspace/types';

export const examPapers = pgTable('exam_papers', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  createdById: text('created_by_id').notNull().references(() => user.id),
  title: text('title').notNull(),
  subject: text('subject', { 
    enum: ['math', 'english', 'chinese', 'physics', 'chemistry'] 
  }).notNull(),
  grade: text('grade'),
  sourceImageKeys: jsonb('source_image_keys').$type<string[]>().notNull().default([]),
  isTemplate: boolean('is_template').notNull().default(false),
  questions: jsonb('questions').$type<Question[]>(),
  templateMeta: jsonb('template_meta').$type<{
    derivedFromGradingId?: string;     // 从哪次批改沉淀来的
    reviewedAt?: string;
    reviewedById?: string;
  }>(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => ({
  orgIdx: index('papers_org_idx').on(t.organizationId),
  templateIdx: index('papers_template_idx').on(t.isTemplate),
}));
```

**`packages/db/src/schema/grading-records.ts`**：

```typescript
import { pgTable, uuid, text, jsonb, timestamp, integer, boolean, index } from 'drizzle-orm/pg-core';
import { organization } from './organizations';
import { user } from './auth';
import { students } from './students';
import { examPapers } from './exam-papers';
import type { QuestionResult } from '@workspace/types';

export const gradingRecords = pgTable('grading_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  teacherId: text('teacher_id').notNull().references(() => user.id),
  studentId: uuid('student_id').notNull().references(() => students.id),
  examPaperId: uuid('exam_paper_id').references(() => examPapers.id),
  
  status: text('status', { 
    enum: ['pending', 'processing', 'completed', 'failed'] 
  }).notNull().default('pending'),
  
  answerImageKeys: jsonb('answer_image_keys').$type<string[]>().notNull().default([]),
  llmRawOutput: jsonb('llm_raw_output'),       // 调试用，保留原始返回
  results: jsonb('results').$type<QuestionResult[]>(),
  
  totalScore: integer('total_score'),
  maxScore: integer('max_score'),
  teacherModified: boolean('teacher_modified').notNull().default(false),
  teacherComment: text('teacher_comment'),
  
  modelUsed: text('model_used'),
  tokensUsed: integer('tokens_used'),
  costCents: integer('cost_cents'),
  durationMs: integer('duration_ms'),
  
  errorMessage: text('error_message'),
  retryCount: integer('retry_count').notNull().default(0),
  
  createdAt: timestamp('created_at').notNull().defaultNow(),
  completedAt: timestamp('completed_at'),
}, (t) => ({
  orgIdx: index('grading_org_idx').on(t.organizationId),
  studentIdx: index('grading_student_idx').on(t.studentId),
  statusIdx: index('grading_status_idx').on(t.status),
}));
```

**`packages/db/src/schema/mistake-collection.ts`**：

```typescript
import { pgTable, uuid, text, jsonb, timestamp, integer, boolean, unique, index } from 'drizzle-orm/pg-core';
import { organization } from './organizations';
import { students } from './students';

export const mistakeCollection = pgTable('mistake_collection', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
  
  questionHash: text('question_hash').notNull(),    // sha256(stem + correctAnswer)
  questionSnapshot: jsonb('question_snapshot').notNull(),
  studentAnswer: text('student_answer'),
  correctAnswer: text('correct_answer'),
  subject: text('subject').notNull(),
  knowledgeTags: jsonb('knowledge_tags').$type<string[]>().notNull().default([]),
  
  occurrences: integer('occurrences').notNull().default(1),
  mastered: boolean('mastered').notNull().default(false),
  masteredAt: timestamp('mastered_at'),
  
  firstSeenAt: timestamp('first_seen_at').notNull().defaultNow(),
  lastSeenAt: timestamp('last_seen_at').notNull().defaultNow(),
}, (t) => ({
  uniqStudentQuestion: unique('mistake_uniq').on(t.studentId, t.questionHash),
  orgIdx: index('mistake_org_idx').on(t.organizationId),
  knowledgeIdx: index('mistake_knowledge_idx').on(t.knowledgeTags),
}));
```

**`packages/db/src/schema/quotas.ts`**：

```typescript
import { pgTable, text, integer, timestamp, primaryKey } from 'drizzle-orm/pg-core';
import { organization } from './organizations';

export const monthlyQuotas = pgTable('monthly_quotas', {
  organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  yearMonth: text('year_month').notNull(),       // "2026-05"
  gradingsUsed: integer('gradings_used').notNull().default(0),
  tokensUsed: integer('tokens_used').notNull().default(0),
  costCents: integer('cost_cents').notNull().default(0),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => ({
  pk: primaryKey({ columns: [t.organizationId, t.yearMonth] }),
}));
```

### 4.3 共享类型定义（packages/types）

```typescript
// packages/types/src/question.ts
export type QuestionType = 
  | 'single_choice'
  | 'multiple_choice'
  | 'fill_blank'
  | 'short_answer'
  | 'essay';

export type Subject = 'math' | 'english' | 'chinese' | 'physics' | 'chemistry';

export type Confidence = 'high' | 'medium' | 'low';

export interface Question {
  no: string;
  type: QuestionType;
  stem: string;
  options?: string[];
  correctAnswer: string;
  score: number;
  knowledgeTags: string[];
  bbox?: [number, number, number, number];   // [x, y, w, h]
}

export interface QuestionResult {
  questionNo: string;
  questionType: QuestionType;
  questionStem: string;
  studentAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
  scoreGiven: number;
  maxScore: number;
  knowledgeTags: string[];
  llmComment?: string;
  confidence: Confidence;
  teacherModified?: boolean;
  teacherComment?: string;
}
```

---

## 五、多租户隔离方案

### 5.1 设计哲学

**租户单位 = organization**（不是 user，不是 teacher）。

- 每个用户注册时自动创建一个 personal organization（个人订阅老师 = 自己 org 的 owner）
- 所有业务表都有 `organizationId` 字段并加 index
- 所有 query 强制经过 `scopedDb(orgId)` 封装
- 不使用 Postgres RLS（Drizzle 支持有限，应用层更可控）

### 5.2 scopedDb 实现

```typescript
// packages/db/src/scoped.ts
import { db } from './client';
import { and, eq } from 'drizzle-orm';
import { students, examPapers, gradingRecords, mistakeCollection } from './schema';

export function scopedDb(organizationId: string) {
  // 编译期保护：禁止外部传 raw db 进来
  return {
    students: {
      list: () => db.select().from(students)
        .where(and(eq(students.organizationId, organizationId), eq(students.archived, false))),
      findById: (id: string) => db.select().from(students)
        .where(and(eq(students.id, id), eq(students.organizationId, organizationId)))
        .limit(1)
        .then(r => r[0]),
      create: (data: Omit<typeof students.$inferInsert, 'organizationId'>) =>
        db.insert(students).values({ ...data, organizationId }).returning(),
      update: (id: string, data: Partial<typeof students.$inferInsert>) =>
        db.update(students)
          .set(data)
          .where(and(eq(students.id, id), eq(students.organizationId, organizationId)))
          .returning(),
      archive: (id: string) =>
        db.update(students)
          .set({ archived: true })
          .where(and(eq(students.id, id), eq(students.organizationId, organizationId))),
    },
    papers: { /* 同上模式 */ },
    grading: { /* 同上模式 */ },
    mistakes: { /* 同上模式 */ },
  };
}

export type ScopedDb = ReturnType<typeof scopedDb>;
```

### 5.3 业务调用示例

```typescript
// apps/web/src/actions/students.ts
'use server';
import { scopedDb } from '@workspace/db';
import { requireSession } from '@workspace/auth/server';
import { revalidatePath } from 'next/cache';

export async function listStudents() {
  const { activeOrganizationId } = await requireSession();
  const sdb = scopedDb(activeOrganizationId);
  return sdb.students.list();
}

export async function createStudent(input: { name: string; grade: string; subjects: string[] }) {
  const { activeOrganizationId, userId } = await requireSession();
  const sdb = scopedDb(activeOrganizationId);
  const result = await sdb.students.create({
    ...input,
    primaryTeacherId: userId,
  });
  revalidatePath('/students');
  return result[0];
}
```

### 5.4 ESLint 强制规则（自定义）

```javascript
// packages/config/eslint/no-raw-db.js
// 禁止业务代码直接 import db，只能用 scopedDb
{
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [{
        group: ['@workspace/db'],
        importNames: ['db'],
        message: '禁止直接 import db。请使用 scopedDb(organizationId)',
      }],
    }],
  },
}
```

**例外**：`packages/auth/`、`packages/db/`、`apps/worker/` 内部允许直接用 `db`（已在 worker 上下文中处理 orgId）。

### 5.5 测试保护

每个业务表都要写多租户隔离测试：

```typescript
// packages/db/src/scoped.test.ts
test('Org A cannot read Org B students', async () => {
  const orgAId = await createOrg();
  const orgBId = await createOrg();
  
  const sdbA = scopedDb(orgAId);
  const sdbB = scopedDb(orgBId);
  
  await sdbA.students.create({ name: '小明', grade: '初二', subjects: ['math'] });
  
  const orgBStudents = await sdbB.students.list();
  expect(orgBStudents).toHaveLength(0);   // B 看不到 A 的学生
});
```

---

## 六、AI 集成方案

### 6.1 客户端初始化（支持 baseURL 切换）

```typescript
// packages/ai/src/client.ts
import { createOpenAI } from '@ai-sdk/openai';

export const aiProvider = createOpenAI({
  baseURL: process.env.AI_BASE_URL || 'https://api.openai.com/v1',
  apiKey: process.env.AI_API_KEY!,
});

export const VISION_MODEL = process.env.AI_VISION_MODEL || 'gpt-5.5';
```

### 6.2 Zod Schema（与 DB 类型对齐）

```typescript
// packages/ai/src/schemas.ts
import { z } from 'zod';

export const QuestionResultSchema = z.object({
  questionNo: z.string(),
  questionType: z.enum(['single_choice', 'multiple_choice', 'fill_blank', 'short_answer', 'essay']),
  questionStem: z.string(),
  studentAnswer: z.string(),
  correctAnswer: z.string(),
  isCorrect: z.boolean(),
  scoreGiven: z.number(),
  maxScore: z.number(),
  knowledgeTags: z.array(z.string()),
  llmComment: z.string().optional(),
  confidence: z.enum(['high', 'medium', 'low']),
});

export const GradingResultSchema = z.object({
  questions: z.array(QuestionResultSchema),
  totalScore: z.number(),
  maxScore: z.number(),
  overallComment: z.string(),
  unrecognizedRegions: z.array(z.string()).optional(),  // 字迹不清等
});

export type GradingResult = z.infer<typeof GradingResultSchema>;
```

### 6.3 主判分函数

```typescript
// packages/ai/src/grader.ts
import { generateObject } from 'ai';
import { aiProvider, VISION_MODEL } from './client';
import { GradingResultSchema } from './schemas';
import { getPrompt } from './prompts';
import type { Question, Subject } from '@workspace/types';
import { logger } from '@workspace/logger';

export interface GradeExamParams {
  subject: Subject;
  paperImageUrls: string[];
  templateQuestions?: Question[];   // 有模板就传，没有就让 LLM 自己识别
}

export async function gradeExam(params: GradeExamParams) {
  const prompt = getPrompt(params.subject);
  const startedAt = Date.now();
  
  try {
    const result = await generateObject({
      model: aiProvider(VISION_MODEL),
      schema: GradingResultSchema,
      messages: [
        { role: 'system', content: prompt.system },
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt.buildUserText(params.templateQuestions) },
            ...params.paperImageUrls.map((url) => ({
              type: 'image' as const,
              image: url,
            })),
          ],
        },
      ],
      temperature: 0.1,
    });
    
    logger.info({
      subject: params.subject,
      durationMs: Date.now() - startedAt,
      tokens: result.usage,
      questionsCount: result.object.questions.length,
    }, 'grading completed');
    
    return {
      object: result.object,
      usage: result.usage,
      durationMs: Date.now() - startedAt,
    };
  } catch (err) {
    logger.error({ err, subject: params.subject }, 'grading failed');
    throw err;
  }
}
```

### 6.4 Prompt 设计哲学

每科一份独立 prompt，统一返回 `GradingResult` 结构。

**通用约束**（base.ts）：
- 严格 JSON 输出
- 每题必须给 confidence
- 字迹不清不要瞎判，confidence=low + llmComment 说明
- 数据脱敏：学生姓名用 [学生] 占位

**学科专属**（math.ts 等）：
- 数学：等价判断规则、单位、有效数字
- 英语：拼写容错策略
- 语文：古诗默写错一字扣分
- 物理：单位 + 数值
- 化学：方程式配平、上下标

### 6.5 准确率监控

```typescript
// scripts/accuracy-test.ts
// 每个 prompt 变更后跑全量 fixture
// 输出对比报告：本次 vs 上次准确率
import { gradeExam } from '@workspace/ai';
import { loadFixtures, expectedAnswers } from './fixtures';

const results = await Promise.all(
  loadFixtures().map(async (fixture) => {
    const { object } = await gradeExam(fixture);
    return compareWithExpected(object, expectedAnswers[fixture.id]);
  })
);

const accuracy = computeAccuracy(results);
console.log(`Overall accuracy: ${accuracy.overall}%`);
console.log(`By subject:`, accuracy.bySubject);
// 衰退 > 5% 退出非零，CI 拦截
```

---

## 七、任务队列与异步流程

### 7.1 pg-boss 设置

```typescript
// apps/worker/src/lib/boss.ts
import PgBoss from 'pg-boss';

export const boss = new PgBoss({
  connectionString: process.env.DATABASE_URL,
  schema: 'pgboss',
  retryLimit: 3,
  retryDelay: 30,
  expireInHours: 1,
});
```

### 7.2 任务定义

```typescript
// apps/worker/src/jobs/grade-exam.ts
import { boss } from '../lib/boss';
import { gradeExam } from '@workspace/ai';
import { db, gradingRecords, mistakeCollection } from '@workspace/db';
import { storage } from '@workspace/storage';
import { eq } from 'drizzle-orm';

interface GradeExamJob {
  gradingId: string;
}

export async function registerGradeExamJob() {
  await boss.work<GradeExamJob>('grade-exam', { teamSize: 3 }, async (job) => {
    const { gradingId } = job.data;
    
    // 1. 取记录
    const record = await db.select().from(gradingRecords)
      .where(eq(gradingRecords.id, gradingId))
      .limit(1)
      .then(r => r[0]);
    if (!record) throw new Error(`Grading record ${gradingId} not found`);
    
    // 2. 更新状态为 processing
    await db.update(gradingRecords)
      .set({ status: 'processing' })
      .where(eq(gradingRecords.id, gradingId));
    
    try {
      // 3. 拿图片签名 URL
      const imageUrls = await Promise.all(
        record.answerImageKeys.map((key) => storage.getUrl(key))
      );
      
      // 4. 取模板（如果有）
      const templateQuestions = record.examPaperId
        ? await loadTemplate(record.examPaperId)
        : undefined;
      
      // 5. 调 LLM
      const { object, usage, durationMs } = await gradeExam({
        subject: getSubjectFromPaper(record),
        paperImageUrls: imageUrls,
        templateQuestions,
      });
      
      // 6. 写结果
      await db.update(gradingRecords)
        .set({
          status: 'completed',
          results: object.questions,
          totalScore: object.totalScore,
          maxScore: object.maxScore,
          llmRawOutput: object,
          tokensUsed: usage.totalTokens,
          durationMs,
          completedAt: new Date(),
        })
        .where(eq(gradingRecords.id, gradingId));
      
      // 7. 错题入库
      await collectMistakes(record, object);
      
      // 8. 扣配额
      await deductQuota(record.organizationId);
      
    } catch (err) {
      await db.update(gradingRecords)
        .set({
          status: 'failed',
          errorMessage: err instanceof Error ? err.message : String(err),
          retryCount: record.retryCount + 1,
        })
        .where(eq(gradingRecords.id, gradingId));
      throw err;   // pg-boss 自动重试
    }
  });
}
```

### 7.3 Worker 入口

```typescript
// apps/worker/src/index.ts
import { boss } from './lib/boss';
import { registerGradeExamJob } from './jobs/grade-exam';
import { registerExtractTemplateJob } from './jobs/extract-template';
import { registerCleanupJob } from './jobs/cleanup-orphan-files';
import { logger } from '@workspace/logger';

async function main() {
  await boss.start();
  logger.info('pg-boss started');
  
  await registerGradeExamJob();
  await registerExtractTemplateJob();
  await registerCleanupJob();
  
  // 定时任务
  await boss.schedule('cleanup-orphan-files', '0 3 * * *', {}, { tz: 'Asia/Shanghai' });
  
  logger.info('all jobs registered');
}

process.on('SIGTERM', async () => {
  logger.info('shutting down gracefully');
  await boss.stop({ graceful: true });
  process.exit(0);
});

main().catch((err) => {
  logger.error({ err }, 'worker startup failed');
  process.exit(1);
});
```

### 7.4 入队 API

```typescript
// apps/web/src/app/api/grade/route.ts
import { NextResponse } from 'next/server';
import { requireSession } from '@workspace/auth/server';
import { scopedDb } from '@workspace/db';
import PgBoss from 'pg-boss';
import { z } from 'zod';

const RequestSchema = z.object({
  studentId: z.string().uuid(),
  examPaperId: z.string().uuid().optional(),
  answerImageKeys: z.array(z.string()).min(1).max(10),
});

const boss = new PgBoss(process.env.DATABASE_URL!);
await boss.start();

export async function POST(request: Request) {
  const session = await requireSession();
  const body = RequestSchema.parse(await request.json());
  
  const sdb = scopedDb(session.activeOrganizationId);
  
  // 配额校验
  await assertQuota(session.activeOrganizationId);
  
  // 写记录
  const [record] = await sdb.grading.create({
    teacherId: session.userId,
    studentId: body.studentId,
    examPaperId: body.examPaperId,
    answerImageKeys: body.answerImageKeys,
    status: 'pending',
  });
  
  // 入队
  await boss.send('grade-exam', { gradingId: record.id });
  
  return NextResponse.json({ gradingId: record.id });
}
```

### 7.5 前端实时订阅

```typescript
// apps/web/src/hooks/use-realtime-grading.ts
import { useEffect, useState } from 'react';
import { createBrowserClient } from '@/lib/supabase-client';

export function useRealtimeGrading(gradingId: string) {
  const [status, setStatus] = useState<'pending'|'processing'|'completed'|'failed'>('pending');
  
  useEffect(() => {
    const supabase = createBrowserClient();
    const channel = supabase
      .channel(`grading:${gradingId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'grading_records',
        filter: `id=eq.${gradingId}`,
      }, (payload) => {
        setStatus(payload.new.status);
      })
      .subscribe();
    
    return () => { supabase.removeChannel(channel); };
  }, [gradingId]);
  
  return status;
}
```

---

## 八、文件存储方案

### 8.1 Provider 抽象接口

```typescript
// packages/storage/src/types.ts
export interface UploadOptions {
  contentType: string;
  expiresIn?: number;       // signed URL 有效期（秒）
}

export interface StorageProvider {
  /** 直接上传 buffer */
  upload(buffer: Buffer, key: string, options: UploadOptions): Promise<{ key: string }>;
  
  /** 生成可直接 PUT 上传的签名 URL（用于前端直传） */
  createUploadUrl(key: string, options: UploadOptions): Promise<{ url: string; key: string }>;
  
  /** 生成访问 URL（可能是公开或签名） */
  getUrl(key: string): Promise<string>;
  
  /** 删除文件 */
  delete(key: string): Promise<void>;
  
  /** 列出某 prefix 下文件（清理用） */
  list(prefix: string): Promise<string[]>;
}
```

### 8.2 本地实现

```typescript
// packages/storage/src/local.ts
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

const ROOT = process.env.LOCAL_STORAGE_ROOT || './uploads';
const PUBLIC_BASE_URL = process.env.LOCAL_STORAGE_PUBLIC_URL || 'http://localhost:3000/uploads';

export class LocalStorageProvider implements StorageProvider {
  async upload(buffer, key, options) {
    const fullPath = path.join(ROOT, key);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, buffer);
    return { key };
  }
  
  async createUploadUrl(key, options) {
    // 生成签名 token，前端 PUT 到 /api/upload/local/[token]
    const token = jwt.sign(
      { key, contentType: options.contentType, exp: Math.floor(Date.now() / 1000) + (options.expiresIn || 600) },
      process.env.LOCAL_UPLOAD_SECRET!,
    );
    return {
      url: `${PUBLIC_BASE_URL.replace('/uploads', '')}/api/upload/local/${token}`,
      key,
    };
  }
  
  async getUrl(key) {
    return `${PUBLIC_BASE_URL}/${key}`;
  }
  
  async delete(key) {
    await fs.unlink(path.join(ROOT, key)).catch(() => {});
  }
  
  async list(prefix) {
    /* 递归列目录 */
  }
}
```

### 8.3 Supabase 实现

```typescript
// packages/storage/src/supabase.ts
import { createClient } from '@supabase/supabase-js';

export class SupabaseStorageProvider implements StorageProvider {
  private supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  private bucket = process.env.SUPABASE_BUCKET || 'uploads';
  
  async upload(buffer, key, options) {
    const { error } = await this.supabase.storage
      .from(this.bucket)
      .upload(key, buffer, { contentType: options.contentType });
    if (error) throw error;
    return { key };
  }
  
  async createUploadUrl(key, options) {
    const { data, error } = await this.supabase.storage
      .from(this.bucket)
      .createSignedUploadUrl(key);
    if (error) throw error;
    return { url: data.signedUrl, key };
  }
  
  async getUrl(key) {
    const { data, error } = await this.supabase.storage
      .from(this.bucket)
      .createSignedUrl(key, 3600);
    if (error) throw error;
    return data.signedUrl;
  }
  
  /* ... */
}
```

### 8.4 工厂

```typescript
// packages/storage/src/factory.ts
import { LocalStorageProvider } from './local';
import { SupabaseStorageProvider } from './supabase';

export function createStorageProvider(): StorageProvider {
  const driver = process.env.STORAGE_PROVIDER || 'local';
  switch (driver) {
    case 'local': return new LocalStorageProvider();
    case 'supabase': return new SupabaseStorageProvider();
    default: throw new Error(`Unknown storage provider: ${driver}`);
  }
}

export const storage = createStorageProvider();
```

### 8.5 文件命名规范

```
{organizationId}/{year}/{month}/{type}/{ulid}.{ext}

例：
01HXX.../2026/05/exam-paper/01HZZ....jpg
01HXX.../2026/05/student-answer/01HZZ....jpg
01HXX.../2026/05/pdf-report/01HZZ....pdf
```

按 organizationId 分目录便于：
- 多租户清理
- 配额按 org 统计
- 备份按 org 粒度

---

## 九、认证与授权

### 9.1 Better-Auth 配置

```typescript
// packages/auth/src/server.ts
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { organization } from 'better-auth/plugins';
import { db } from '@workspace/db';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY!);

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'pg' }),
  
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,   // V1 简化
    sendResetPassword: async ({ user, url }) => {
      await resend.emails.send({
        from: 'noreply@example.com',
        to: user.email,
        subject: '重置密码',
        html: `<a href="${url}">点击重置密码</a>`,
      });
    },
  },
  
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },
  
  session: {
    expiresIn: 60 * 60 * 24 * 30,   // 30 天
    updateAge: 60 * 60 * 24,        // 每天更新
  },
  
  plugins: [
    organization({
      allowUserToCreateOrganization: true,
      organizationLimit: 5,
      membershipLimit: 100,
      creatorRole: 'owner',
    }),
  ],
  
  hooks: {
    after: {
      async signUp({ user }) {
        // 注册后自动创建 personal organization
        await db.transaction(async (tx) => {
          const org = await tx.insert(organization).values({
            id: generateId(),
            name: `${user.name} 的工作室`,
            slug: `personal-${user.id}`,
            metadata: { isPersonal: true, subscriptionStatus: 'free', monthlyQuota: 50 },
          }).returning();
          
          await tx.insert(member).values({
            id: generateId(),
            organizationId: org[0].id,
            userId: user.id,
            role: 'owner',
          });
        });
      },
    },
  },
});
```

### 9.2 客户端

```typescript
// packages/auth/src/client.ts
import { createAuthClient } from 'better-auth/react';
import { organizationClient } from 'better-auth/client/plugins';

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL!,
  plugins: [organizationClient()],
});
```

### 9.3 Session 校验封装

```typescript
// packages/auth/src/server-helpers.ts
import { auth } from './server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

export async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}

export async function requireSession() {
  const session = await getSession();
  if (!session) redirect('/login');
  
  const activeOrganizationId = session.session.activeOrganizationId
    ?? await getPersonalOrgId(session.user.id);
  
  return {
    userId: session.user.id,
    user: session.user,
    activeOrganizationId,
  };
}

export async function requireRole(role: 'owner' | 'admin') {
  const session = await requireSession();
  const member = await db.select().from(member)
    .where(and(
      eq(member.userId, session.userId),
      eq(member.organizationId, session.activeOrganizationId),
    ))
    .limit(1).then(r => r[0]);
  
  if (!member) throw new Error('Not a member');
  if (role === 'owner' && member.role !== 'owner') throw new Error('Forbidden');
  if (role === 'admin' && !['owner', 'admin'].includes(member.role)) throw new Error('Forbidden');
  
  return { ...session, role: member.role };
}
```

---

## 十、部署架构

### 10.1 服务器准备

- 操作系统：Ubuntu 22.04 LTS（或类似）
- Node.js：20.9+（用 nvm 管理）
- pnpm：9.x
- Nginx：1.24+
- PostgreSQL：通过 Supabase 云访问（不本地装）
- 进程管理：PM2 5.x

### 10.2 部署流程

```bash
# 一次性配置
git clone <repo> /opt/teacher-score
cd /opt/teacher-score
nvm use 20
npm install -g pnpm pm2

# 每次发版
cd /opt/teacher-score
git pull
pnpm install --frozen-lockfile
pnpm db:migrate                            # Drizzle migration
pnpm build                                 # 构建所有 app
pm2 reload ecosystem.config.js --env production

# 一次性启动
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup                                # systemd 开机自启
```

### 10.3 `package.json` scripts（root）

```json
{
  "scripts": {
    "dev": "pnpm --parallel -r dev",
    "dev:web": "pnpm --filter=@workspace/web dev",
    "dev:worker": "pnpm --filter=@workspace/worker dev",
    "build": "pnpm -r build",
    "lint": "pnpm -r lint",
    "test": "pnpm -r test",
    "test:e2e": "pnpm --filter=@workspace/web test:e2e",
    "db:generate": "pnpm --filter=@workspace/db generate",
    "db:migrate": "pnpm --filter=@workspace/db migrate",
    "db:studio": "pnpm --filter=@workspace/db studio",
    "accuracy": "tsx scripts/accuracy-test.ts"
  }
}
```

### 10.4 PM2 配置

```javascript
// ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'teacher-score-web',
      cwd: './apps/web',
      script: '.next/standalone/server.js',
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
        HOSTNAME: '0.0.0.0',
      },
      instances: 1,
      autorestart: true,
      max_memory_restart: '1G',
      error_file: '/var/log/pm2/web-err.log',
      out_file: '/var/log/pm2/web-out.log',
      time: true,
    },
    {
      name: 'teacher-score-worker',
      cwd: './apps/worker',
      script: 'dist/index.js',
      env_production: { NODE_ENV: 'production' },
      instances: 1,
      autorestart: true,
      max_memory_restart: '512M',
      error_file: '/var/log/pm2/worker-err.log',
      out_file: '/var/log/pm2/worker-out.log',
      time: true,
    },
  ],
};
```

### 10.5 Nginx 反代

```nginx
# /etc/nginx/sites-available/teacher-score
server {
    listen 443 ssl http2;
    server_name app.example.com;
    
    ssl_certificate /etc/letsencrypt/live/app.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/app.example.com/privkey.pem;
    
    client_max_body_size 30M;       # 允许图片上传
    
    # 静态文件直接走 Nginx
    location /_next/static/ {
        alias /opt/teacher-score/apps/web/.next/static/;
        expires 365d;
        add_header Cache-Control "public, immutable";
    }
    
    # 本地存储的图片
    location /uploads/ {
        alias /opt/teacher-score/uploads/;
        expires 30d;
    }
    
    # 其他请求转发到 Next.js
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 90s;
    }
}

server {
    listen 80;
    server_name app.example.com;
    return 301 https://$host$request_uri;
}
```

### 10.6 Next.js 配置

```javascript
// apps/web/next.config.mjs
import { withSentryConfig } from '@sentry/nextjs';

const nextConfig = {
  output: 'standalone',
  transpilePackages: [
    '@workspace/db',
    '@workspace/auth',
    '@workspace/ai',
    '@workspace/storage',
    '@workspace/logger',
    '@workspace/analytics',
    '@workspace/email',
    '@workspace/types',
  ],
  experimental: {
    serverActions: { bodySizeLimit: '30mb' },
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
    ],
  },
};

export default withSentryConfig(nextConfig, {
  silent: true,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
});
```

---

## 十一、监控、日志与埋点

### 11.1 Pino Logger 抽象

```typescript
// packages/logger/src/index.ts
import pino from 'pino';

const isDev = process.env.NODE_ENV !== 'production';

export const logger = pino({
  level: process.env.LOG_LEVEL || (isDev ? 'debug' : 'info'),
  transport: isDev ? { target: 'pino-pretty', options: { colorize: true } } : undefined,
  redact: {
    paths: [
      'password', 'token', 'apiKey',
      '*.email', 'user.email',
      'studentName', 'student.name',   // 学生姓名脱敏
    ],
    censor: '[REDACTED]',
  },
  formatters: {
    level: (label) => ({ level: label }),
  },
  base: { service: 'teacher-score', env: process.env.NODE_ENV },
});

// Sentry 集成
import * as Sentry from '@sentry/nextjs';

logger.on('error', (err) => Sentry.captureException(err));
```

### 11.2 Sentry 配置

```typescript
// apps/web/src/instrumentation.ts
import * as Sentry from '@sentry/nextjs';

export function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      tracesSampleRate: 0.1,
      environment: process.env.NODE_ENV,
    });
  }
}
```

### 11.3 PostHog 埋点

```typescript
// packages/analytics/src/server.ts
import { PostHog } from 'posthog-node';

export const posthog = new PostHog(process.env.POSTHOG_API_KEY!, {
  host: process.env.POSTHOG_HOST || 'https://us.i.posthog.com',
});

export async function track(event: string, distinctId: string, properties?: Record<string, any>) {
  posthog.capture({ event, distinctId, properties });
}

export async function identify(userId: string, properties: Record<string, any>) {
  posthog.identify({ distinctId: userId, properties });
}
```

**关键事件埋点清单**：

| 事件 | 触发点 | 关键 properties |
|---|---|---|
| user_signed_up | 注册完成 | source, provider |
| student_created | 创建学生 | grade, subjects |
| grading_started | 触发批改 | subject, hasTemplate |
| grading_completed | 批改完成 | durationMs, accuracy_signal |
| grading_score_modified | 老师改分 | questionType, originalScore, newScore |
| paper_saved_as_template | 保存模板 | subject, questionsCount |
| pdf_exported | 导出 PDF | type |
| quota_exceeded | 配额超限 | org_tier |

### 11.4 LLM 调用监控

```typescript
// 每次调用都记录
logger.info({
  event: 'llm_call',
  model: 'gpt-5.5',
  subject,
  promptTokens: usage.promptTokens,
  completionTokens: usage.completionTokens,
  totalTokens: usage.totalTokens,
  durationMs,
  costCents: estimateCost(usage),
}, 'llm call completed');

// 每周跑准确率报告（cron job）
// 抽样老师改分记录，统计 LLM 错误率
```

---

## 十二、配置与环境变量

### 12.1 `.env.example`

```bash
# === Database ===
DATABASE_URL=postgres://postgres.xxxxx:password@aws-0-us-east-1.pooler.supabase.com:6543/postgres
DIRECT_DATABASE_URL=postgres://postgres.xxxxx:password@db.xxxxx.supabase.co:5432/postgres   # for migration

# === Supabase ===
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx
SUPABASE_SERVICE_ROLE_KEY=xxx

# === Auth ===
BETTER_AUTH_SECRET=xxx   # 用 openssl rand -hex 32 生成
BETTER_AUTH_URL=https://app.example.com
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# === AI ===
AI_BASE_URL=https://api.openai.com/v1
AI_API_KEY=sk-xxx
AI_VISION_MODEL=gpt-5.5

# === Storage ===
STORAGE_PROVIDER=local                        # local | supabase
LOCAL_STORAGE_ROOT=/opt/teacher-score/uploads
LOCAL_STORAGE_PUBLIC_URL=https://app.example.com/uploads
LOCAL_UPLOAD_SECRET=xxx                       # 签名 token 密钥
SUPABASE_BUCKET=uploads                       # 仅 STORAGE_PROVIDER=supabase 时

# === Email ===
RESEND_API_KEY=
EMAIL_FROM=noreply@example.com

# === Monitoring ===
SENTRY_DSN=
SENTRY_ORG=
SENTRY_PROJECT=
NEXT_PUBLIC_SENTRY_DSN=

# === Analytics ===
POSTHOG_API_KEY=
POSTHOG_HOST=https://us.i.posthog.com
NEXT_PUBLIC_POSTHOG_KEY=
NEXT_PUBLIC_POSTHOG_HOST=

# === App ===
NODE_ENV=development
NEXT_PUBLIC_APP_URL=http://localhost:3000
PHONE_UPLOAD_TOKEN_SECRET=xxx                 # 扫码 token
LOG_LEVEL=debug
```

### 12.2 .env 加载策略

- `apps/web/` 和 `apps/worker/` 各自有 `.env.local`（不提交）
- 根目录 `.env.example` 作为模板
- 生产用 `pm2-env` 或服务器 systemd 环境变量

---

## 十三、开发工作流

### 13.1 初次启动

```bash
git clone <repo>
cd teacher-score-application
pnpm install

# 复制环境变量
cp .env.example .env.local
# 编辑 .env.local 填入真实值

# 初始化数据库
pnpm db:generate     # 生成 SQL migration
pnpm db:migrate      # 推到 Supabase

# 启动开发
pnpm dev             # 同时启动 web + worker
```

### 13.2 日常开发命令

```bash
pnpm dev                     # 全启
pnpm dev:web                 # 只起 web
pnpm dev:worker              # 只起 worker
pnpm test                    # 跑所有单测
pnpm lint                    # 跑所有 lint
pnpm db:studio               # 打开 Drizzle Studio 看数据
pnpm accuracy                # 跑准确率回归
```

### 13.3 添加新包

```bash
# 在 packages/ 下创建新目录
mkdir packages/new-pkg
cd packages/new-pkg
pnpm init
# package.json 名字改为 @workspace/new-pkg
# 在使用方 package.json 加 "@workspace/new-pkg": "workspace:*"
pnpm install
```

### 13.4 Git 工作流

- `main` 分支：稳定，PM2 拉取
- 功能分支：`feat/xxx` / `fix/xxx`
- Commit message：约定式（feat:, fix:, docs:, etc.）
- PR 必须过 lint + test

### 13.5 数据库变更

```bash
# 1. 修改 packages/db/src/schema/*.ts
# 2. 生成 migration
pnpm db:generate
# 3. 检查生成的 SQL（drizzle/0001_xxx.sql）
# 4. 应用
pnpm db:migrate
```

---

## 十四、风险与兜底方案

### 14.1 技术风险

| 风险 | 概率 | 影响 | 兜底 |
|---|---|---|---|
| LLM 5 科准确率参差 | 高 | 高 | 学科特定 prompt 持续迭代；UI 标注 beta；准确率监控阻断发版 |
| 整张试卷题目分割错乱 | 中 | 中 | 引导框选 / 一题一拍作为退路 |
| GPT-5.5 API 限流 | 中 | 中 | 多 baseURL 切换；worker 内 p-queue 控制并发 |
| Zod schema 解析失败 | 中 | 中 | 重试 + 降级 free-form text 兜底 |
| 批改超 60s | 低 | 中 | 异步队列已解决；前端可继续操作 |
| 多租户数据泄漏 | 低 | 灾难性 | scopedDb 封装 + ESLint 强制 + 集成测试 |
| 文件存储满磁盘 | 中 | 中 | 定时清理孤儿文件；磁盘监控告警 |
| Supabase DB 不可用 | 低 | 高 | 多备份；自建 Postgres 备选方案文档化 |

### 14.2 产品风险

| 风险 | 概率 | 影响 | 兜底 |
|---|---|---|---|
| 老师不愿改习惯 | 中 | 高 | 种子用户深度访谈 / 强调 ROI |
| 准确率不达预期 → 流失 | 中 | 高 | 透明展示置信度；快速人工复核 |
| 配额免费层亏钱 | 中 | 中 | 每月 50 次硬上限；成本监控 |
| 5 科上线工期爆 | 高 | 高 | 优先磨数+英；其他学科标 beta |

### 14.3 合规与安全

| 风险 | 概率 | 影响 | 兜底 |
|---|---|---|---|
| 学生姓名传 LLM | 中 | 中 | prompt 用占位符替换 |
| 图片含 EXIF 隐私 | 低 | 低 | sharp 上传时 strip 元数据 |
| Token 泄漏 | 中 | 高 | 不进 git；服务器变量管理；定期轮换 |
| LLM 输出含 PII | 低 | 中 | 不存学生信息到日志 |

---

## 十五、未来扩展点（架构层面）

虽然 V1 不实现，但架构应预留：

### 15.1 多模型对比（V1.5）
- AI client 可同时调用 GPT-5.5 和 Gemini，对比结果
- DB 加 `model_comparison` 表
- 老师可看不同模型的判分差异

### 15.2 缓存层（V2）
- 同一张图重复判分 → Redis 缓存
- 题目识别结果按图片 hash 缓存

### 15.3 自部署 LLM 选项（V2+）
- 客户私有部署时切到 vLLM
- `aiProvider` 已支持自定义 baseURL，无需改业务代码

### 15.4 移动 App（V3）
- 不重写后端，复用 Route Handlers
- 用 React Native + 共享 packages/

---

## 附录 A：第一周开发任务清单

按建议执行顺序（每行可用 1 个 PR）：

1. 初始化 monorepo（pnpm-workspace.yaml + tsconfig.base.json）
2. 创建 `packages/config` + `packages/types`
3. 创建 `packages/db`（schema + drizzle.config + scoped）
4. 创建 `packages/auth`（Better-Auth + Drizzle adapter + organization 插件）
5. 创建 `packages/logger`（pino + Sentry transport）
6. 创建 `packages/ai`（client + grader + 数学/英语 prompt 骨架）
7. 创建 `packages/storage`（local 实现）
8. 创建 `apps/web`（Next 16 init + Chakra + ChakraProvider）
9. 实现 /login /register 页面 + Better-Auth 接入
10. 实现学生 CRUD（用 Server Actions）
11. 实现 /api/upload/sign + /api/grade（仅入队，先无 worker）
12. 创建 `apps/worker`（pg-boss + grade-exam job 骨架）
13. 端到端跑通：拍张图 → 判分 → 看到结果
14. 用真实试卷测试准确率（至少 3 张）
15. ecosystem.config.js + Nginx 配置文档化

---

## 附录 B：版本历史

| 版本 | 日期 | 变更 |
|---|---|---|
| v1.0 | 2026-05-13 | 初始版本 |
