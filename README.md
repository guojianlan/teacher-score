# 教师批改 SaaS

老师拍照批改试卷，多模态 LLM 自动判分，错题自动归集为学情资产。

## 仓库结构

```
.
├── apps/
│   ├── web/        # Next.js + Chakra UI (Next 15)
│   └── backend/    # Hono HTTP + pg-boss worker
├── packages/
│   ├── config/     # tsconfig + eslint flat + no-raw-db rule + vitest
│   ├── types/      # Subject / QuestionType / Confidence / QuestionResult
│   ├── logger/     # Pino + redact 敏感字段
│   ├── db/         # Drizzle schema + scopedDb(orgId)
│   ├── auth/       # Better-Auth server config + personal-org hook + client
│   ├── email/      # Resend prod / console dev
│   ├── storage/    # Local provider + Supabase skeleton + key safety
│   ├── ai/         # OpenAI-compatible vision client + Zod schema + prompts
│   └── jobs/       # gradeExamJobHandler — multi-tenant safe
├── docs/claude/    # 产品/计划/架构/任务清单
├── scripts/
│   └── accuracy-test.ts
└── ecosystem.config.cjs   # PM2 three-process layout
```

## 阅读顺序

1. `docs/claude/FINAL_IMPLEMENTATION_DECISION.md` — 架构最终决策
2. `docs/claude/DEVELOPMENT_TASK_CHECKLIST.md` — 开发任务清单
3. `docs/claude/DEFERRED.md` — 仓库内已完成 vs 需要外部资源的清单
4. `docs/claude/PRODUCT.md` / `REQUIREMENTS.md` — 产品和需求边界

## 本地启动

```bash
# 1. 安装依赖
pnpm install

# 2. 配置环境
cp .env.example .env
# 至少填 DATABASE_URL 和 BETTER_AUTH_SECRET

# 3. 初始化数据库
pnpm db:generate
pnpm db:migrate

# 4. 三进程开发
pnpm dev:backend    # apps/backend/src/http.ts on :3001
pnpm dev:worker     # apps/backend/src/worker.ts (pg-boss consumer)
pnpm dev:web        # apps/web on :3000 (rewrites /api/* -> :3001)
```

注：未配置 `AI_API_KEY` 时，批改流程会返回 mock 结果，整条链路（上传→入队→worker→状态轮询→改分）仍可端到端验证。

## 红线（来自 `DEVELOPMENT_TASK_CHECKLIST.md` §三）

- 所有业务表必须包含 `organizationId` 并建 index
- 业务查询必须走 `scopedDb(organizationId)`，禁止 import raw `db`（`no-raw-db` lint 拦截）
- worker job payload 必须含 `gradingId + organizationId`，worker 必须双校验
- Better-Auth handler 只挂在 `apps/backend/api/auth/*`，`apps/web` 不挂载
- 浏览器只请求同域 `/api/*`，本地通过 Next rewrites 代理
- 批改进度 3 秒轮询，不用 Supabase Realtime
- 上传服务端 MIME / size 校验 + `sharp` 清理 EXIF/GPS
- 文件 key 必须以 `organizationId` 开头，跨 org 读返回 403
- LLM prompt 用 `[学生]` 占位，不传真实姓名
- 日志不输出 password / token / apiKey / email / studentName
- `boss.ts` 不调 `boss.start()`、不注册 worker handler；`worker.ts` 是唯一入口

## 部署形态

- 单机 PM2 三进程：`teacher-score-web` / `teacher-score-api` / `teacher-score-worker`
- Nginx 同域代理：`/api/*` -> backend，`/*` -> web
- Postgres：Supabase 香港 / 新加坡
- 存储：Supabase Storage（`STORAGE_DRIVER=supabase`）

参考 `ecosystem.config.cjs` 与 `deploy/nginx.conf.example`。
