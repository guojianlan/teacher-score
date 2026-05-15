# Design Tokens 方案讨论记录

**参与方**：Claude（设计方案）vs Codex / OpenAI（独立审查）
**日期**：2026-05-15
**轮次**：3 轮达成共识（上限 10 轮）
**Codex session id**：`019e2ae4-1182-7f33-aab3-19db72a86107`

---

## 一、Codex 发现的 8 个问题（Round 1）

| # | 问题 | 严重度 |
|---|---|---|
| F1 | **sepia 主题没有真正接入 Chakra**。`providers.tsx` 只喂 `base/_dark`；sepia 存在于 token.json 和 CSS 但 Chakra 拿不到 → 预览效果好看但实际组件不变色 | **CRITICAL** |
| F2 | WCAG 实际有 16 个硬性失败 / 52 个 warn / 100 通过，比文档"4 文本 + 3 UI"的表述更严重 | HIGH |
| F3 | `focusRing` 失败被定为 WARN 与规范"focusRing 必须 ≥3:1"自相矛盾 | HIGH |
| F4 | OKLCH 算法只取色相，不保留设计师给的原始 hex（500 档不等于输入色）| MEDIUM |
| F5 | `contrast` 强制白色，导致 green/orange/purple solid+contrast 通通失败 | HIGH |
| F6 | palette 默认就 8 个（已经撞上限），cap 没起到治理作用 | MEDIUM |
| F7 | ESLint `no-raw-color` 只能覆盖 JSX literal，sx/css/style/recipe 都能逃逸；规范说"强制"言过其实 | MEDIUM |
| F8 | 规范与代码漂移：`add-palette.ts` 还写"7 子键"、CSS 文件名对不上、sepia 接入状态描述错 | MEDIUM |

---

## 二、最终共识（Round 3 Locked）

### 必须立刻修（block 长期 commit）

| # | 项 | 决策 |
|---|---|---|
| **A** | sepia 接入 | 改造 `providers.tsx`：Chakra `semanticTokens` 用 `var(--xxx)` 引用 CSS 变量，`data-theme` 接管 light/dark/sepia 切换；放弃 Chakra 原生的 `base/_dark` 二分 |
| **B** | contrast 自动选 | `add-palette.ts` 按对 `solid` 的对比度自动选 white / near-black，不硬编码 |
| **C** | focusRing 升级 | `audit-tokens.ts` 把 `focusRing vs bg.canvas` 和 `focusRing vs solid` 都从 WARN 改为 ERROR |
| **D** | OKLCH 改名 | 工具文案"anchor/500" → "hue source"；原 hex 存到 `$description`；design-lab.html 显示"input hex ≠ generated 500"提示 |
| **E** | 默认 palette 集合精简 | 默认只留 `primary / neutral / success / warning / danger` 5 个；`secondary / info / purple` 改为 opt-in（保留脚本，需要时再加）|
| **F** | 加 token 校验器 | 新增 `scripts/validate-tokens.ts`：检查 3 主题齐全、每 palette 恰好 8 键、refs 全部能解析、palette 数 ≤8；输出非 0 时阻塞。`pnpm tokens:sync` 启动前先跑它 |
| **G** | 规范漂移修正 | `add-palette.ts` 改"8 子键"；统一 CSS 文件名；ESLint"强制"措辞改为如实描述覆盖范围；focusRing 描述对齐 ERROR |
| **H** | `design-system.html` 处理 | 加入 `.gitignore`，由 `tokens:sync` 重生成；不再 commit |

### 可以延后（不阻塞）

- 更强 ESLint 规则（semgrep/AST 拦 `sx/css/style/recipe`）
- 主题切换的 Chakra 组件渲染 smoke test

---

## 三、Codex 对两个具体问题的答复

### Q1：Chakra v3 接 sepia 的正确模式

```ts
const semanticTokens = {
  colors: {
    primary: {
      solid:      { value: 'var(--palette-primary-solid)' },
      contrast:   { value: 'var(--palette-primary-contrast)' },
      fg:         { value: 'var(--palette-primary-fg)' },
      subtle:     { value: 'var(--palette-primary-subtle)' },
      muted:      { value: 'var(--palette-primary-muted)' },
      emphasized: { value: 'var(--palette-primary-emphasized)' },
      border:     { value: 'var(--palette-primary-border)' },
      focusRing:  { value: 'var(--palette-primary-focusring)' },
    },
    bg: { canvas: { value: 'var(--bg-canvas)' } },
    fg: { default: { value: 'var(--fg-default)' } },
  },
};
```

配合 `tokens.css`：
```css
:root, [data-theme='light'] { --palette-primary-solid: #2849E8; ... }
[data-theme='dark']         { --palette-primary-solid: #3D66F5; ... }
[data-theme='sepia']        { --palette-primary-solid: #5C4530; ... }
```

注意：Chakra v3 默认会发出自己的 CSS 变量名（如 `--chakra-colors-primary-solid`），可用 `cssVarsRoot` 选项把它和我们的 `tokens.css` 挂到同一个 root（`:where(html)` 或 `:where(:root, :host)`）。

文档：
- chakra-ui.com/docs/theming/semantic-tokens
- chakra-ui.com/docs/theming/overview  
- chakra-ui.com/docs/theming/customization/css-variables
- chakra-ui.com/docs/theming/customization/conditions

### Q2：validator 跑哪里？

**两个地方都要**：
- 独立命令 `pnpm tokens:validate`（CI 用）
- 在 `tokens:sync` 入口先跑一次，校验失败就 abort——**不允许坏 JSON 生成产物**

---

## 四、Codex 最终判词

> "保留架构，缩小默认 palette 集合，让运行时主题行为诚实。最大风险不是 OKLCH，而是相信 JSON/CSS 预览能证明 Chakra 行为，但 `providers.tsx` 才是真正的接入点。"
>
> 架构现在是连贯的：**JSON 为真源 → 校验器为闸门 → CSS 变量驱动主题 → Chakra 语义 token 做适配器 → audit 守 a11y**。

---

## 五、执行 checklist

按依赖顺序：

```
1. G/H 文档/产物收尾    ── 30 min  (不动代码，先把规范说对)
2. F 校验器              ── 1 hr   (新脚本，独立)
3. B contrast 自动选     ── 1 hr   (改 add-palette.ts + 跑一次重生成)
4. C focusRing → ERROR   ── 15 min (改 audit-tokens.ts 一行)
5. E 默认 palette 精简   ── 30 min (改 add-palette.ts 默认集 + design-lab.html)
6. D OKLCH 改名 + 元数据  ── 1 hr   (改 add-color.ts + design-lab.html 文案)
7. A sepia 接入           ── 3-4 hr (改造 providers.tsx + sync.ts + tokens.css 结构 + 验证)
```

A 是最大的，建议放最后做一个独立 PR，前面 6 项可以一起合。
