# Codex 与 Claude Code 开发计划讨论记录

> 日期：2026-05-13  
> 主题：开发计划草案、Claude Code 文档评审、最终执行计划对齐  
> 记录目的：保存 Codex 先出计划文档、Claude Code 审阅文档、双方达成一致的过程  
> Leader：Codex

---

## 一、用户要求

用户要求的流程是：

1. Codex 先根据当前 Markdown 文档出一份开发计划。
2. 这份计划必须先落成文档。
3. 再让 Claude Code 查看这份计划文档。
4. Codex 与 Claude Code 基于文档沟通，直到达成一致。
5. 最后根据双方统一同意的方式，输出最终开发计划文档。

因此本轮不采用“把草案直接塞进 Claude prompt”的方式，而是先新增：

```text
docs/claude/CODEX_DEVELOPMENT_PLAN_DRAFT.md
```

再让 Claude Code 审阅该文件。

---

## 二、Codex 草案

Codex 根据以下文档整理开发计划草案：

- `PRODUCT.md`
- `REQUIREMENTS.md`
- `FINAL_IMPLEMENTATION_DECISION.md`
- `ARCHITECTURE.md`
- `CODEX_CLAUDE_DISCUSSION_LOG.md`

草案文件：

```text
docs/claude/CODEX_DEVELOPMENT_PLAN_DRAFT.md
```

草案核心内容：

1. 采用 `apps/web + apps/backend + packages/*`。
2. `apps/backend` 使用 Hono，并拆 `http.ts` 与 `worker.ts`。
3. `packages/jobs` 只放纯任务逻辑。
4. Better-Auth handler 放 backend `/api/auth/*`。
5. 批改进度使用轮询。
6. 多租户边界是 organization。
7. 阶段 0-4 分阶段推进完整 5 科。

---

## 三、Claude Code 第一轮评审

Codex 调用 Claude Code CLI，让其读取并评审：

```text
docs/claude/CODEX_DEVELOPMENT_PLAN_DRAFT.md
```

同时允许 Claude Code 交叉读取：

```text
docs/claude/FINAL_IMPLEMENTATION_DECISION.md
docs/claude/REQUIREMENTS.md
docs/claude/PRODUCT.md
docs/claude/ARCHITECTURE.md
docs/claude/CODEX_CLAUDE_DISCUSSION_LOG.md
```

Claude Code 第一轮结论：

> 可行（带必须修改项）。

Claude Code 认为草案与最终执行版高度一致，但提出 6 个必须修改项。

### M1：缺失 API 限流

`REQUIREMENTS.md` 明确要求：

- 每用户 ≤ 100 req/min
- LLM 批改 ≤ 10/min/user 且 ≤ 100/day/user
- 全局 IP ≤ 1000 req/min

草案必须把 rate-limit middleware 和 LLM 专用限流写进阶段任务。

### M2：`apps/backend/src/boss.ts` 边界未定义

必须明确：

- `boss.ts` 只导出 pg-boss client 和入队 helper。
- `boss.ts` 不调用 `boss.start()`。
- `worker.ts` 是唯一调用 `boss.start()` 的入口。

### M3：`organization.monthlyQuota` 默认值未写

必须明确：

- `monthlyQuota integer not null default 50`
- personal org 创建后默认 free + monthlyQuota 50
- 该项进入阶段 0 验收。

### M4：packages 初始化清单与目录结构图不一致

必须明确：

- 阶段 0 初始化 `config/types/logger/db/auth/storage/jobs/ai/email`
- 阶段 1 初始化 `analytics`
- 阶段 3 初始化 `pdf`

### M5：Better-Auth handler 必须显式挂在 backend `/api/auth/*`

必须把以下内容写进阶段 0：

- Better-Auth server handler 挂在 backend Hono `/api/auth/*`
- `apps/web` 不保留 Better-Auth route handler
- 验收增加 `POST /api/auth/sign-up/email` 命中 backend

### M6：阶段 0 多租户隔离测试必须覆盖 worker

必须增加负向测试：

- 伪造 organizationId 的 job payload 直接发给 worker
- worker 拒绝处理
- grading record 不被修改

---

## 四、Codex 二轮回应

Codex 接受 Claude Code 的全部 M1-M6 修改项，并准备在最终 `DEVELOPMENT_PLAN.md` 中这样修订：

1. 阶段 0 增加 rate-limit middleware：
   - 每用户 100 req/min
   - 全局 IP 1000 req/min
   - 阶段 1 在 `POST /api/grade` 增加 LLM 专用限制：10/min/user、100/day/user
2. 明确 `apps/backend/src/boss.ts` 只导出 PgBoss client 和 `sendJob` helpers，不调用 `boss.start()`。
3. `organizations.monthlyQuota` 明确 `default(50)`。
4. packages 初始化顺序修正：
   - 阶段 0：`config/types/logger/db/auth/storage/jobs/ai/email`
   - 阶段 1：`analytics`
   - 阶段 3：`pdf`
5. 阶段 0 明确 Better-Auth server handler 挂载在 backend Hono `/api/auth/*`。
6. 阶段 0 多租户测试增加伪造 organizationId worker payload，断言拒绝处理且 grading record 不被修改。

Codex 同时吸收建议项：

- 正式拆阶段 0a / 0b。
- 正式拆阶段 1a / 1b。
- 补 `apiServer` Cookie 转发说明。
- `monthly_quotas` 主键为 `(organizationId, yearMonth)`。
- 部署计划注明 Supabase HK / SG。
- 阶段 1 验收补浏览器 / getUserMedia 兼容性。
- `no-raw-db` 阶段 0 强制。

---

## 五、Claude Code 第二轮确认

Claude Code 对 Codex 二轮修订逐项验证：

| 项 | 判定 |
|---|---|
| M1 全局 / LLM 限流 | 满足 |
| M2 boss.ts 与 worker.ts 边界 | 满足 |
| M3 monthlyQuota 默认值 | 满足 |
| M4 packages 分阶段初始化 | 满足 |
| M5 Better-Auth 单一边界 | 满足 |
| M6 多租户负向测试 | 满足 |

Claude Code 第二轮结论：

> 同意。Codex 可以基于以上修订直接落最终 DEVELOPMENT_PLAN.md，无阻塞项。

Claude Code 额外提醒了 3 个落地细节：

1. 限流中间件的存储后端在阶段 0 说明清楚，单机 PM2 形态下不要引入 Redis 依赖。
2. 伪造 organizationId 测试除了断言 worker 拒绝，还要断言 `grading_records.status` 仍为 pending，且未被任何字段写入。
3. 文件 key 以 organizationId 开头这条红线，建议在阶段 0 多租户测试里再加一条“跨 org 读取 storage key 必须 403”。

这些提醒已吸收到最终 `DEVELOPMENT_PLAN.md`。

---

## 六、最终产物

最终一致版文档：

```text
docs/claude/DEVELOPMENT_PLAN.md
```

Codex 与 Claude Code 一致同意：

1. 该计划符合 `FINAL_IMPLEMENTATION_DECISION.md`。
2. 阶段 0 必须先做硬架构底座，不追求页面丰富。
3. API 限流、LLM 限流、多租户隔离、Better-Auth backend 边界、worker org 双校验是硬验收。
4. 数学和英语先打磨，语文 / 物理 / 化学在阶段 2 扩科。
5. `ARCHITECTURE.md` 的旧草案内容必须在阶段 0 收尾时修订。
