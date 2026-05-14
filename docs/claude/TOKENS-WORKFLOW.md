# Design Tokens · 双向工作流

## 单一真实来源

**`docs/claude/token.json`** —— W3C DTCG 格式，Figma Tokens Studio 兼容。
所有的颜色、字体、间距、圆角、动效都在里面。

> 重要：**不要直接改 TS 文件**（`apps/web/src/styles/tokens/__generated.ts` 是生成产物）。
> 业务代码 import 走 `@/styles/tokens` → 间接走 `__generated.ts`，不感知 JSON 是否存在。

## 结构

```
docs/claude/
  token.json                          ← 源头（DTCG）
  design-system.html                  ← 生成的视觉文档

apps/web/src/styles/
  tokens.css                          ← 生成的 CSS 变量（gitignored）
  tokens/
    __generated.ts                    ← 生成的 TS (gitignored, 业务代码 import)
    index.ts                          ← 公共 API（手写、re-export）
    sync.ts                           ← JSON → TS/CSS/HTML 构建器
```

## token.json 顶层结构

```jsonc
{
  "$schema": "...",
  "core":      { /* 原料：color.{gray,blue,...}, fontSize, space, radius, ... */ },
  "light":     { /* 一个 theme 的全部 semantic 值：bg, fg, border, interactive, status, effect */ },
  "dark":      { /* 另一个 theme */ },
  "motion":    { /* theme-agnostic */ },
  "textStyle": { /* theme-agnostic */ },
  "$themes":   [/* Tokens Studio 配置 */],
  "$metadata": {/* tokenSetOrder, version, ... */}
}
```

加新 theme = 加一个顶层 set + 在 `$themes` 里登记。`sync.ts` 自动识别。

## 设计师工作流

1. 设计师在 Figma 装 [Tokens Studio](https://tokens.studio/) 插件。
2. 把 `docs/claude/token.json` 加载进去（或直接接 GitHub Sync 配 Tokens Studio）。
3. 改 token（颜色、字号、间距等）→ Tokens Studio 写回 JSON。
4. 提 PR：`token.json` 的 diff 一目了然。
5. 开发者 merge 后，跑 `pnpm tokens:sync` 重新生成 TS/CSS/HTML。

## 开发者工作流

### 改 token（直接编辑 JSON）

```bash
# 编辑 docs/claude/token.json
pnpm tokens:sync
# 自动重新生成：
#   - apps/web/src/styles/tokens/__generated.ts
#   - apps/web/src/styles/tokens.css
#   - docs/claude/design-system.html
# Next.js dev 服务器自动热更新
```

### 写业务代码

业务代码不感知 JSON：

```tsx
import { Box, Text, Button } from '@chakra-ui/react';

// 直接用 Chakra 的 semantic tokens（已映射到 token.json）
<Box bg="bg.canvas" borderColor="border.default">
  <Text textStyle="bodyLg" color="fg.muted">正文</Text>
  <Button>主操作</Button>  {/* 自动用 interactive.primary */}
</Box>
```

### 加新 token

1. 编辑 `docs/claude/token.json`，加新 token（必须有 `$type`、`$value`、最好有 `$description`）
2. 用 ref 语法引用 core：`"$value": "{core.color.gray.100}"`
3. `pnpm tokens:sync`
4. 业务代码立即可用

### 加新 theme

1. 在 `token.json` 加 `semantic/sepia`（或其他名字）token set
2. 在 `$themes` 数组加一项
3. `pnpm tokens:sync` 输出会自动加 `[data-theme='sepia'] { ... }` CSS rule
4. 切换：`document.documentElement.setAttribute('data-theme', 'sepia')`

## TS → JSON（反向，一次性迁移用）

```bash
pnpm tokens:export-json
# 读现有的 TS 值，反推生成 JSON
# 一般只在初始迁移用一次；之后 JSON 是源
```

## 红线

- ❌ 不要写 `<Box bg="gray.500">` — 用 `bg="fg.muted"` / `bg="bg.muted"` 这种 semantic
- ❌ 不要硬编码颜色 `color="#1F2937"` — 全部走 token
- ❌ 不要改 `__generated.ts`（每次 sync 都会覆盖）
- ✅ 改 token 总在 `docs/claude/token.json`
- ✅ 改完跑 `pnpm tokens:sync`

## 给设计师的传话

**首次接入**：

> 1. Figma 装 Tokens Studio 插件
> 2. 我把 `token.json` 发你 / 配 GitHub Sync 仓库
> 3. 调色 / 改字号请改 `core` 或 `semantic/light` 这一层
> 4. 改 `core.color.blue.600` 会自动影响所有以它为引用的语义色（`interactive.primary.bg` 等）
> 5. 加新 token 请写 `$description`，是注释也是文档
> 6. 不要改 `$themes` / `$metadata`，那是工具用的
