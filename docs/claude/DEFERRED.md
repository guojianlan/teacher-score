# 已延迟项 — 需要外部资源或人

> 日期：2026-05-13
> 适用范围：本仓库代码骨架已覆盖 PR-00 ~ PR-09 的全部强约束。本文列出**不能在仓库内独立完成**的清单中的剩余任务以及它们的依赖。

---

## 一、需要真实 LLM 凭证 / 视觉模型才能跑通

| 阶段 | 任务 | 依赖 |
|---|---|---|
| §六.3 | 实现 AI client（真实调用路径） | `AI_API_KEY` + 支持视觉的 OpenAI 兼容端点（GPT-5.5 / Gemini 3.0） |
| §六.5 / §六.6 | math prompt 准确率 ≥ 85% | 真实视觉模型 + 数学 fixture |
| §七.2 | english prompt 准确率 ≥ 85% | 同上 + 英语 fixture |
| §八 | chinese / physics / chemistry prompt 准确率 baseline | 同上 + 三科 fixture |

代码层面：`packages/ai` 已实现完整的真实调用路径与 mock 兜底。`AI_API_KEY` 一旦配置即生效，无需改代码。

## 二、需要采集真实试卷 fixture

清单 §六.1 / §七.1 / §八.1-3 要求每科 ≥ 20 张真实试卷或答卷图片 + 人工标注 `expected.json`。

仓库已建立 `scripts/accuracy-test.ts` 与 `fixtures/<subject>/*` + `baselines/<subject>.json` 协议，但**fixture 图片本身需要老师 / 用户线下提供**，仓库不会预置。

## 三、需要 Supabase 实际环境

| 阶段 | 任务 | 依赖 |
|---|---|---|
| §五.16 | staging 验证 | Supabase Postgres + Storage（区域优先香港/新加坡） |
| §十二.5 | Supabase Postgres region | 用户在 Supabase Dashboard 配置 |

代码层面：`packages/storage/src/supabase.ts` 已实现完整 driver；切换 `STORAGE_DRIVER=supabase` + 三项 env 即可。

## 四、需要种子用户

| 阶段 | 任务 | 依赖 |
|---|---|---|
| §六 | 5 个种子老师试用数学闭环 | 用户的辅导老师朋友圈 |
| §七 | 30 个种子老师试用数学+英语 | 同上扩展 |

这些任务的"完成"由真实用户的反馈定义，仓库代码无法满足。

## 五、需要部署平台与监控配置

| 阶段 | 任务 | 依赖 |
|---|---|---|
| §六.15 | Sentry / PostHog 接入 | `SENTRY_DSN` / `POSTHOG_API_KEY` |
| §十二.3-7 | PM2 三进程 / Nginx / 生产发版 | 服务器、域名、SSL |

仓库已提供 `ecosystem.config.cjs`（PM2）和 `deploy/nginx.conf.example`，未配置时 logger 静默禁用 Sentry/PostHog 路径。

## 六、阶段 3 / 4 完整内容

- 阶段 3（§九）：
  - [x] `packages/pdf` 骨架 + grading-report HTML 渲染器
  - [x] `generatePdfJobHandler` + worker 注册 + `POST /api/pdf/grading/:id`
  - [x] 模板 CRUD API + UI（`/api/templates`、`apps/web/src/app/(app)/templates`）
  - [x] 批改结果页 "保存为模板" + "导出 PDF" 按钮
  - [x] 学情接口（progress / heatmap / summary）+ 学生详情页
  - [ ] 模板复用批改（grade 流程加 "使用模板" 路径，schema 已支持 `examPaperId`，UI 选择器待补）
  - [ ] 错题本 UI 增强（搜索 / 排序 / 标记已掌握）— `POST /api/mistakes/:id/master` 接口存在，UI 待加
  - [ ] PDF 真打印为 application/pdf（当前生成 HTML；接 Chromium 后切 binary）
- 阶段 4（§十）所有 P2 候选任务：按用户反馈 / 商业化必要再做，本轮不做承诺。

## 七、文档同步任务（§十三）

- [x] `docs/claude/ARCHITECTURE.md` 顶部已加冲突项清单（指向 `FINAL_IMPLEMENTATION_DECISION.md`）。
- [x] 根目录 `README.md` 与 `docs/claude/DEPLOY.md` 已同步阅读顺序与发版步骤。

## 八、Next.js 版本差异

清单 §四.16 写的是 Next.js 16；本仓库使用 Next.js 15（当前最新稳定版本）。App Router、Server Components、`async cookies()` API 等本仓库依赖的能力两者一致。当 Next.js 16 GA 后，将 `apps/web/package.json` 中的 `next` 升到 `^16.0.0` 并跑一次端到端即可。

---

## 已在仓库中达成的硬验收

- [x] 所有业务表带 `organizationId` 并建 index（`packages/db/src/schema/*.ts`）
- [x] `scopedDb(organizationId)` 封装（`packages/db/src/scoped.ts`）
- [x] `no-raw-db` ESLint 规则（`packages/config/rules/no-raw-db.js`）
- [x] worker job payload 包含 `gradingId + organizationId` 双校验（`packages/jobs/src/grade-exam.ts`）
- [x] Better-Auth handler 挂在 backend `/api/auth/*`，apps/web 不挂载（`apps/backend/src/app.ts`）
- [x] 同域 `/api/*` + Next rewrites + `apiServer` 转发 Cookie
- [x] 3 秒轮询批改进度（`apps/web/src/app/(app)/grade/[id]/page.tsx`），未用 Realtime
- [x] 上传服务端 MIME / size 校验 + sharp 清理 EXIF / GPS（`apps/backend/src/routes/upload.ts`）
- [x] 文件 key 以 `organizationId` 开头，跨 org 读返回 403（`packages/storage/src/index.ts` + 测试）
- [x] LLM prompt 学生姓名占位 `[学生]`（`packages/ai/src/prompts.ts`）
- [x] 日志 redact 敏感字段（`packages/logger/src/index.ts`）
- [x] `boss.ts` 只导出 client + sendJob；`worker.ts` 是唯一调用 `.work()` 的入口
- [x] 组织表 `isPersonal / subscriptionTier / monthlyQuota` 为顶级列，非 JSONB
- [x] 注册自动创建 personal organization 并设为 owner
- [x] 每用户 100/min、全局 IP 1000/min、LLM 10/min + 100/day 限流
- [x] LLM 失败重试上限 3 次 + 成本熔断
- [x] PM2 三进程 ecosystem 配置 + Nginx 同域代理示例
- [x] 多租户负向单元测试桩 + 跨 org storage key 单元测试
- [x] 5 科 prompt（math / english / chinese / physics / chemistry）全部到位
- [x] PostHog 6 个种子运营事件埋点 + Sentry 静默-when-unconfigured
- [x] 模板 CRUD + 学情接口 + PDF 渲染器 + generate-pdf 异步 job
- [x] Auth / multi-tenant / worker 安全集成测试（gated on DATABASE_URL）
- [x] Playwright E2E 骨架（stage 1 happy path + stage 3 mistakes/PDF）
- [x] ARCHITECTURE.md 旧路径已标注冲突；DEPLOY.md 发版手册到位
- [x] 模板复用批改路径（worker 传入 template.questions，UI 选模板下拉框）
- [x] 错题本搜索 / 排序 / "标记已掌握" UI
- [x] 修改密码 UI + 数据导出 + 账户注销
- [x] Google OAuth 配置开关
- [x] CSV 批量导入学生 `POST /api/students/bulk`
- [x] 邀请老师 / 切换组织 / 角色管理（owner/admin/member）
- [x] 家长 7 天签名分享链接（HMAC-SHA256，公开只读视图，学生姓名脱敏）
- [x] fixtures + baselines 协议骨架（README + 各学科子目录）
- [x] 合成 fixture 生成器 `scripts/generate-synthetic-fixtures.ts`（让 accuracy 管道可端到端跑通）
- [x] 演示种子数据 `scripts/seed-demo.ts`（user + org + students + 已完成批改 + 错题 + 配额）
- [x] Puppeteer PDF 真打印（有 Chromium 即输出 application/pdf，否则回退 HTML）
- [x] 手机扫码拍照 H5（`/m/capture` + 桌面端 QR + 3 秒轮询拉取 mobile 上传 keys）
