# Codex 与 Claude Code 架构讨论记录

> 日期：2026-05-13  
> 主题：完整 5 科、`apps/backend`、Hono/NestJS、Worker 放置方式  
> 记录目的：保留架构讨论过程，供后续项目启动时追溯决策依据  
> Leader：Codex

---

## 一、用户更新的约束

用户在第一轮审阅后补充：

1. 交付时间已经往后调整，可以接受晚点交付。
2. 因此不希望为了三个月工期砍学科，仍希望按完整学科推进。
3. 希望讨论是否可以从 `apps/web + apps/worker` 改为 `apps/web + apps/backend`。
4. `apps/backend` 可用 Hono 或 NestJS 起服务并承载 API。
5. 询问 `apps/worker` 是否可以放在 `packages` 里实现。
6. 要求 Codex 与 Claude Code 讨论，最终形成双方认可的方案。
7. 要求保存最终决策文档和双方讨论详情。
8. 用户任命 Codex 为 leader，由 Codex 统筹和拍板。

---

## 二、第一轮：交给 Claude Code 的问题

Codex 发给 Claude Code 的问题摘要：

```text
我们进入第二轮架构讨论。用户作为项目负责人已经更新约束：

1. 交付时间可以往后调整，可以接受晚点交付，所以不要为了 3 个月硬砍学科；完整学科仍然保留：数学、英语、语文、物理、化学。
2. 用户希望重新讨论代码组织：原方案 apps/web + apps/worker。现在提出是否改成 apps/web + apps/backend 两个 app，其中 backend 用 Hono 或 NestJS 起独立服务，承载 API、后台任务、worker 消费、LLM 调用、文件处理等。也问 apps/worker 是否可以放进 packages 里实现。
3. 用户要求我和你 Claude Code 讨论后达成最终正确形式，并将最终决定文档保存到项目，另外也要保存你我讨论详情。
4. 我 Codex 是 leader，最后由我统筹拍板。

请你作为 Claude Code 独立架构顾问，评估：
A. apps/worker 是否应该放 packages？为什么？
B. apps/backend 用 Hono 还是 NestJS 更适合这个项目？
C. 最终推荐的 monorepo 结构应该是什么？
D. 完整 5 科情况下，阶段计划如何安排才不会失控？
E. 哪些原文档技术风险仍必须修正？
```

---

## 三、Claude Code 第一轮观点

Claude Code 第一轮核心观点：

1. `apps/worker` 不应该放进 `packages`。
2. `packages` 的语义是共享库，不应该有进程生命周期。
3. Worker 如果作为独立进程，应保持在 `apps/worker`；可复用 job handler 可以抽到 `packages/jobs`。
4. 如果确实要拆独立 backend，Hono 比 NestJS 更适合。
5. NestJS 更适合大团队强规范，本项目会被 decorator、DI、module 体系增加负担。
6. Claude 第一轮默认推荐仍然是 `apps/web + apps/worker`，理由是更简单，Next.js Route Handlers 足够承载 API。
7. Claude 同时承认，如果未来要移动端或第三方 API，`apps/server/backend` 才有充分理由。

Claude 第一轮建议的可选结构：

```text
方案一：
apps/web
apps/worker
packages/jobs

方案二：
apps/web
apps/server 或 apps/backend
packages/jobs
```

Claude 第一轮仍要求修正：

- 不要在 Route Handler 顶层 `boss.start()`。
- Worker job 必须带 `organizationId`。
- Supabase Realtime 与无 RLS 冲突，建议改轮询。
- `subscriptionTier/monthlyQuota` 不要放 JSONB。

---

## 四、Codex Leader 中间判断

Codex 对第一轮的判断：

1. Claude 第一轮偏保守，站在最小复杂度角度推荐 `apps/web + apps/worker` 是合理的。
2. 但用户已经明确偏向 `apps/web + apps/backend`，并且项目目标从压缩 MVP 调整为完整 5 科和更长期交付。
3. 完整范围下，backend 不再只是“几个 Route Handlers”，而会承担认证、上传、批改、LLM、队列、PDF、配额、未来手机端/机构端 API。
4. 因此独立 backend 的长期价值超过它带来的额外复杂度。
5. 但 worker 进程仍不应该放入 `packages`。
6. 折中方案是：`apps/backend` 作为 app，内部有 HTTP API 入口和 Worker 入口；`packages/jobs` 放纯业务逻辑。

---

## 五、第二轮：Codex 提交给 Claude Code 的候选拍板方案

Codex 发给 Claude Code 的第二轮问题摘要：

```text
我作为 leader 准备拍板一个折中但更贴合用户偏好的方案，请你做最后挑战：

最终候选：
- apps/web：Next.js，只负责前端 UI、页面路由、SSR/RSC、静态资源。尽量不承载业务 REST API，不直接跑 pg-boss。
- apps/backend：Hono 后端 app。它是一个 package，但包含两个可启动入口：
  - src/http.ts 或 src/index.ts：启动 Hono HTTP API，提供 /api/students /api/grade /api/upload /api/papers /api/mistakes /api/quotas /api/auth-session 等。
  - src/worker.ts：启动 pg-boss worker，消费 grade-exam / generate-pdf / cleanup / extract-template 等任务。
  PM2 或部署平台可以把同一个 apps/backend 跑成两个 process：teacher-score-api 和 teacher-score-worker。
- packages/jobs：放纯 job handler 业务逻辑，供 apps/backend/src/worker.ts 调用；不放进程生命周期。
- packages/db/auth/ai/storage/pdf/types/config/logger 保留。

理由：用户倾向 web/backend 两 app 分离；现在接受完整 5 科和更长周期，后端将承载大量 API、文件、LLM、队列、PDF、配额、未来手机端/机构端 API，独立 backend 的长期价值更大。Hono 比 NestJS 更轻，不引入过重 DI/decorator。

请你判断：这个方案是否比 apps/web + apps/worker 更适合作为最终文档？有没有硬伤？如果有硬伤请指出；如果没有，请输出你同意后的最终结构、边界、必须注意的 auth/session/CORS/部署问题。
```

---

## 六、Claude Code 第二轮结论

Claude Code 第二轮结论：

> 同意，无硬伤。

Claude 补充了 3 个实现级陷阱：

### 陷阱 1：Better-Auth 必须完整迁移到 apps/backend

如果 auth handler 留在 Next.js，而业务 API 在 Hono，会导致 session/OAuth callback 分裂。最终应让 Better-Auth server handler 完整运行在 backend：

```text
apps/backend
  /api/auth/*
```

`apps/web` 只保留登录注册 UI 和 auth client 调用。

### 陷阱 2：Next.js RSC 调 Hono API 必须统一转发 Cookie

RSC/server-side fetch 默认不会自动带浏览器 cookie。必须封装 `apiServer`，从 `next/headers` 读取 cookies 并转发给 backend。

### 陷阱 3：本地开发要避免跨端口 Cookie/CORS 问题

本地开发时：

```text
web      localhost:3000
backend  localhost:3001
```

浏览器不要直接请求 `localhost:3001`。应使用 Next.js rewrites：

```text
localhost:3000/api/* -> localhost:3001/api/*
```

生产环境用 Nginx 同域分流：

```text
/api/* -> backend:3001
/*     -> web:3000
```

---

## 七、最终双方共识

最终方案：

```text
apps/web
apps/backend
packages/jobs
packages/db
packages/auth
packages/ai
packages/storage
packages/pdf
packages/types
packages/config
packages/logger
packages/analytics
packages/email
```

关键共识：

1. `apps/backend` 使用 Hono，不使用 NestJS。
2. `apps/backend` 有 `http.ts` 和 `worker.ts` 两个入口。
3. worker 进程不放 `packages`。
4. job handler 逻辑放 `packages/jobs`。
5. Better-Auth server handler 放在 backend。
6. Next.js 通过 rewrites 代理 `/api/*` 到 backend，避免本地 Cookie/CORS 问题。
7. V1 保留完整 5 科，但分阶段推进，每科必须有 fixture 准确率门槛。
8. 批改进度使用轮询，不使用 Supabase Realtime。
9. `subscriptionTier/monthlyQuota/isPersonal` 改成 organization 表正式列。
10. 所有 worker job payload 必须带 `organizationId`。

---

## 八、Leader 最终拍板

Codex 作为 leader 最终决定：

采用 `apps/web + apps/backend`。

原因：

- 更符合用户希望的前后端分离。
- 更适合完整 5 科和更长交付周期。
- 更利于未来手机端、机构端、开放 API。
- Hono 保持轻量，不引入 NestJS 的过重抽象。
- `apps/backend` 双入口模式能同时满足 API 和 worker，但仍保持部署边界清晰。
- `packages/jobs` 保持复用性，同时避免 packages 承载进程生命周期。

该决策已固化到：

```text
docs/claude/FINAL_IMPLEMENTATION_DECISION.md
```

