# 部署运行手册

> 适用于阶段 0 / 1 / 2 单机 PM2 三进程形态。
> 对应清单 §十二 部署与环境清单 / §五.16 staging 验证。

---

## 一、目标环境

- 单机：1 台 4 核 / 8 GB / 80 GB SSD 起步。
- Node：20.9+（仓库根 `.nvmrc`）。
- 数据库：Supabase Postgres，region 优先香港 / 新加坡。
- 存储：Supabase Storage 私有 bucket。
- 邮件：Resend。
- 监控：Sentry + PostHog（可选；未配置时静默禁用）。

## 二、首次部署

```bash
# 1) 基础环境
sudo apt update && sudo apt install -y nginx
curl -fsSL https://get.pnpm.io/install.sh | sh -
nvm install 20.9 && nvm use 20.9
pnpm add -g pm2

# 2) 拉代码
git clone <repo> /opt/teacher-score && cd /opt/teacher-score

# 3) 环境变量
cp .env.example .env
# 至少填：DATABASE_URL、BETTER_AUTH_SECRET、APP_URL、BACKEND_INTERNAL_URL、
#        AI_BASE_URL+AI_API_KEY、STORAGE_DRIVER=supabase + SUPABASE_*、
#        EMAIL_FROM+RESEND_API_KEY、SENTRY_DSN（可选）、POSTHOG_API_KEY（可选）

# 4) 安装 + 构建
pnpm install --frozen-lockfile
pnpm build

# 5) 数据库迁移
pnpm db:migrate

# 6) Nginx：把 deploy/nginx.conf.example 拷到 /etc/nginx/sites-available/teacher-score
sudo cp deploy/nginx.conf.example /etc/nginx/sites-available/teacher-score
# 修改 server_name 为你的域名
sudo ln -s /etc/nginx/sites-available/teacher-score /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# 7) SSL：用 certbot
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.example

# 8) PM2 启动三进程
pm2 start ecosystem.config.cjs --env production
pm2 save
pm2 startup    # 跟随系统自启
```

## 三、常规发版（清单 §十二.7）

```bash
cd /opt/teacher-score
git pull
pnpm install --frozen-lockfile
pnpm build
pnpm db:migrate
pm2 reload ecosystem.config.cjs --env production
pm2 logs --lines 50
```

`pm2 reload`（而非 `restart`）做零停机滚动重启。

## 四、Staging 验证步骤（清单 §五.16）

1. 在 staging 服务器上同样部署完整三进程。
2. 验证 Nginx `/api/* -> :3001`，`/* -> :3000`。
3. 验证 Supabase Postgres 可连接（`pnpm db:migrate` 无错）。
4. 验证 storage：上传一张图片，看 `uploads/{orgId}/...` 出现在 Supabase Storage。
5. 跑 E2E：在 `e2e/` 下 `E2E_BASE_URL=https://staging.example pnpm test`。
6. 跑一次跨 org 负向 fetch（用户 A 的 cookie 请求用户 B 的 student id），应得 403。
7. 看 PostHog 是否收到 `user_signed_up` / `grading_started` / `grading_completed` 事件。

## 五、回滚

```bash
cd /opt/teacher-score
git checkout <last-good-sha>
pnpm install --frozen-lockfile
pnpm build
pm2 reload ecosystem.config.cjs --env production
```

如果迁移已经跑了不能回退，先确认 schema 变更是否向后兼容；不兼容时只能 forward fix。

## 六、监控与告警

- Sentry：未配 DSN 时静默；配后所有 worker / http 错误都进 Sentry。
- PostHog：未配 key 时静默；配后埋点见 `packages/analytics/src/index.ts`。
- pg-boss：表 `pgboss.job` 直接 SQL 看队列堆积。
- 慢查询：Supabase Dashboard "Query Performance"。

## 七、常见故障

| 症状 | 处置 |
|---|---|
| 注册后没有 personal org | 看 `apps/backend/src/worker.ts` 日志中 `auth` scope，确认 `ensurePersonalOrganization` 是否抛错 |
| 上传 400 unsupported_media_type | sharp 解析失败，检查 HEIC 在服务器是否有 libheif；或浏览器 File.type 是非图片 |
| worker 不消费 | 看 `pm2 logs teacher-score-worker`；常见为 `DATABASE_URL` 与 PgBoss schema 不一致 |
| 跨 org 数据互通 | **立即停机**，检查最近 PR 是否绕过 `scopedDb` |
