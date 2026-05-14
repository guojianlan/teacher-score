# Claude 协作文档

本目录存放与 Claude 共同梳理的产品和技术文档，供后续开发对齐。

## 文档清单

| 文档 | 说明 |
|---|---|
| [FINAL_IMPLEMENTATION_DECISION.md](./FINAL_IMPLEMENTATION_DECISION.md) | **最终执行版**：Codex 与 Claude Code 讨论后的架构拍板、目录结构、阶段计划 |
| [DEVELOPMENT_PLAN.md](./DEVELOPMENT_PLAN.md) | **最终开发计划**：Codex 先出草案、Claude Code 审阅后达成一致的阶段化实施计划 |
| [DEVELOPMENT_TASK_CHECKLIST.md](./DEVELOPMENT_TASK_CHECKLIST.md) | **最终任务清单**：把开发计划拆成可执行、可验收、可按 PR 推进的 checkbox 清单，已由 Claude Code CLI 确认 |
| [DEVELOPMENT_PLAN_DISCUSSION_LOG.md](./DEVELOPMENT_PLAN_DISCUSSION_LOG.md) | Codex 与 Claude Code 围绕开发计划草案的审阅、修改与二轮确认记录 |
| [CODEX_DEVELOPMENT_PLAN_DRAFT.md](./CODEX_DEVELOPMENT_PLAN_DRAFT.md) | Codex 开发计划草案：供 Claude Code 审阅的初始计划，不作为最终执行依据 |
| [CODEX_CLAUDE_DISCUSSION_LOG.md](./CODEX_CLAUDE_DISCUSSION_LOG.md) | Codex 与 Claude Code 的讨论详情与决策过程 |
| [PRODUCT.md](./PRODUCT.md) | 产品文档：定位、用户、价值主张、演进路径、商业模式、成功指标 |
| [REQUIREMENTS.md](./REQUIREMENTS.md) | 需求文档：用户故事、功能模块、非功能性需求、阶段范围 |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | 原始技术架构草案：与最终执行版冲突时，以 `FINAL_IMPLEMENTATION_DECISION.md` 为准 |

## 阅读顺序

新成员入项目按以下顺序阅读：
1. `FINAL_IMPLEMENTATION_DECISION.md`（先看最终执行架构和阶段计划）
2. `DEVELOPMENT_PLAN.md`（按最终一致的阶段计划执行）
3. `DEVELOPMENT_TASK_CHECKLIST.md`（进入具体开发时按任务清单和 PR 切片执行）
4. `PRODUCT.md` 第一至五节（理解产品定位和用户）
5. `REQUIREMENTS.md` 第二、五节（理解要做什么）
6. `ARCHITECTURE.md`（只作为原始草案参考；冲突处以前述最终执行版和开发计划为准）
7. `CODEX_CLAUDE_DISCUSSION_LOG.md` / `DEVELOPMENT_PLAN_DISCUSSION_LOG.md`（需要追溯为什么这样决策时阅读）

## 变更原则

- 任何产品策略变更 → 先更新 `PRODUCT.md`
- 任何需求增删 → 先更新 `REQUIREMENTS.md`
- 任何架构调整 → 先更新 `ARCHITECTURE.md`
- 三份文档保持版本号一致并写入变更历史

## 关键决策摘要

- **租户单位**：organization（不是 teacher），由 Better-Auth organization 插件管理
- **后端架构**：单 Monorepo，apps/web (Next.js 16) + apps/backend (Hono HTTP API + pg-boss worker 双入口)
- **AI 模型**：多模态 LLM（通过 OpenAI-compatible API + 自定义 baseURL，具体模型运行时配置）
- **文件存储**：Provider 抽象，dev/test 可用本地，staging/production 默认 Supabase Storage
- **多租户安全**：scopedDb(orgId) 强制封装 + ESLint 禁止直接 import db
- **Worker 边界**：进程入口在 apps/backend/src/worker.ts，纯 job 逻辑放 packages/jobs
- **完整学科**：保留数学、英语、语文、物理、化学，按阶段和准确率门槛推进
- **部署**：Git pull + pnpm build + PM2 三进程（web/api/worker），Nginx 同域反代，Supabase Postgres 云托管
