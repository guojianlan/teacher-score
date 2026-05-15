# Design Tokens 规范

本项目（以及后续所有项目）的设计 token 规范。下次开新项目直接拷贝这份文档执行。

---

## 1. 核心结论

- **采用 Chakra UI v3 的 colorPalette 模型**作为颜色语义层
- **每个 palette 必须填齐 8 个键**（来自 v3 源码实测）
- **色阶用 OKLCH 算法生成**（11 档：50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950）
- **JSON 为单一真源**（W3C DTCG 格式，文件名 `token.json`，放在 `docs/claude/` 下）
- **生成产物（TS / CSS / HTML 预览）由 sync 脚本输出**，不进 git 跟踪

---

## 2. Palette 8 键定义

每个 palette 必须包含且仅包含以下 8 个键。键名固定，含义固定。

| 键名 | 类型 | 用途 | 配对说明 |
|---|---|---|---|
| `solid` | bg | 实心元素底色（主操作按钮、徽章实心底） | 必须搭配 `contrast` 作为前景 |
| `contrast` | fg | 叠在 `solid` 上的文字 / 图标色 | 通常是白或深近黑 |
| `fg` | fg | 叠在浅 bg（subtle/muted/emphasized）上的文字色 | 与 subtle/muted 配对 |
| `subtle` | bg | 最浅底（卡片底、tag 底、alert 底） | 静态层 |
| `muted` | bg | hover 态背景 | 比 subtle 深 1 档 |
| `emphasized` | bg | active / 选中态背景 | 比 muted 深 1 档 |
| `border` | border | 边线（outline 按钮、卡片描边） | 介于 muted / emphasized 之间，不与任意 bg 重合 |
| `focusRing` | ring | 键盘 focus 环 | 必须满足 WCAG 2.2 AA 对比度 ≥ 3:1 |

### 维度模型

```
前景  ── fg / contrast          （2 键，强制成对避免撞色）
背景  ── subtle → muted → emphasized → solid   （4 档由浅到深）
边线  ── border                 （1 键，单独 1 档）
聚焦  ── focusRing              （1 键，a11y 专用）
```

### 色阶 → 8 键的映射约定

| 键名 | light | dark | sepia |
|---|---|---|---|
| `contrast` | white | white | white |
| `fg` | step 700 | step 300 | step 700 |
| `subtle` | step 50 | step 950 | step 50 |
| `muted` | step 100 | step 900 | step 100 |
| `emphasized` | step 200 | step 800 | step 200 |
| `border` | step 300 | step 700 | step 300 |
| `solid` | step 600 | step 500 | step 700 |
| `focusRing` | step 500 | step 400 | step 500 |

**遇到不符合视觉的，单独手改 token.json 里那个键的引用即可，不破坏整套规则。**

---

## 3. 色族选择规则

### 标准 palette 集合（默认 5 个）

```
primary    主操作色 / 品牌
neutral    中性（次要按钮、灰阶 UI、卡片描边）
success    成功 / 确认
warning    警告
danger     错误 / 删除
```

### Opt-in palette（默认不要，确认场景后再加）

```
info       信息提示（多数项目和 primary 重复，先不加）
secondary  品牌副色（除非有真实第二品牌色，否则不加）
其他自定义色族（mint/teal/purple/pink ...）  用 pnpm tokens:add-color 一行加
```

### 决策树（加新 palette 前必走）

```
1. 是品牌副色吗？           是 → 加
2. 是新的状态语义吗？        是 → 复用 success/warning/danger 不够才加
3. 是某 feature 专属色吗？   是 → 优先用 primary 变体，不行才加
4. 都不是                   → 不加
```

**硬限制：palette 总数不超过 8 个。** 超了说明分类错误，重新归并。

---

## 4. 色阶生成：OKLCH 算法

每个 palette 对应一个色族（color family），需要 11 档色阶。

### 生成方式

设计师只提供 **1 个 hex 值**作为色族锚点（通常对应 500 档），算法自动算出 11 档。

```ts
import { oklch, formatHex } from 'culori';

const STEPS = {
  50:  { l: 0.97, c: 0.02 },
  100: { l: 0.94, c: 0.04 },
  200: { l: 0.88, c: 0.08 },
  300: { l: 0.80, c: 0.12 },
  400: { l: 0.70, c: 0.16 },
  500: { l: 0.60, c: 0.20 },  // 锚点
  600: { l: 0.52, c: 0.20 },
  700: { l: 0.44, c: 0.18 },
  800: { l: 0.36, c: 0.14 },
  900: { l: 0.28, c: 0.10 },
  950: { l: 0.18, c: 0.06 },
};

function generateScale(hex: string) {
  const { h } = oklch(hex);
  return Object.fromEntries(
    Object.entries(STEPS).map(([step, { l, c }]) =>
      [step, formatHex({ mode: 'oklch', l, c, h })]
    )
  );
}
```

### 为什么 OKLCH 不是 HCT

- OKLCH 算法透明（~30 行可读懂），HCT 是 Google 黑盒
- OKLCH 浏览器原生支持（`oklch(0.7 0.15 280)`），HCT 必须先算成 hex
- OKLCH 视觉更鲜艳，HCT 偏保守

### 不用纯算法的两种例外

- yellow / amber 等高亮度色族：500 档需要手动定 contrast=黑（不是白），avoid 在浅黄按钮上写白字
- 灰阶（gray / neutral）：chroma 接近 0，可以更细调（参考 Radix 的 mauve/slate/sage 暖冷灰）

---

## 5. 文件结构

```
项目根/
├── docs/claude/
│   ├── token.json              ← 单一真源（DTCG，设计师在 Tokens Studio 编辑）
│   ├── DESIGN-TOKENS-SPEC.md   ← 本文档
│   ├── TOKENS-WORKFLOW.md      ← 工作流速查（命令清单）
│   └── design-system.html      ← 生成的设计预览（给设计师看）
│
├── scripts/
│   ├── add-color.ts            ← OKLCH 算 11 档色阶
│   ├── add-palette.ts          ← 套 8 键语义（光 light/dark/sepia 三套）
│   └── export-tokens-json.ts   ← TS → JSON 反向同步（已废弃，保留）
│
├── apps/web/src/styles/tokens/
│   ├── sync.ts                 ← JSON → TS/CSS/HTML 生成器
│   ├── __generated.ts          ← 自动生成，gitignore
│   └── index.ts                ← 业务代码 import 入口
```

### token.json 结构

```jsonc
{
  "$themes": [...],         // Tokens Studio 元数据
  "$metadata": {...},
  "core": {
    "color": {
      "primary": { "50": {...}, ..., "950": {...} },  // 11 档色阶
      "neutral": {...},
      ...
    },
    "white": {...}, "black": {...},
    "fontFamily": {...}, "fontSize": {...}, ...
  },
  "light": {
    "bg": {...}, "fg": {...}, "border": {...}, "status": {...},
    "palette": {
      "primary":   { "solid": {...}, "contrast": {...}, ..., "focusRing": {...} },
      "neutral": {...},
      ...
    }
  },
  "dark":  {...},
  "sepia": {...},
  "motion":    {...},
  "textStyle": {...}
}
```

---

## 6. 工作流

### 6.1 加新色族

```bash
# 一条命令：算 11 档色阶 + 生成 8 键 palette × 3 主题
pnpm tokens:add-color <name> <hex>

# 示例
pnpm tokens:add-color violet "#8B5CF6"

# 内部步骤：
# 1. OKLCH 算法 → core.color.violet 的 11 档
# 2. add-palette helper → light/dark/sepia 三个 palette 的 8 键
# 3. 输出到 token.json
```

### 6.2 同步生成产物

```bash
pnpm tokens:sync
# 读取 token.json，先跑 tokens:validate（任何错误 abort），再生成：
#  - apps/web/src/styles/tokens/__generated.ts  （Chakra 系统 import 用）
#  - apps/web/src/styles/tokens.css             （CSS 变量，data-theme 切换运行时）
#  - docs/claude/design-system.html             （静态预览页）
# 全部 gitignore，运行 sync 即可重生成。
```

### 6.3 设计师协作

1. 设计师在 Figma Tokens Studio 编辑 `docs/claude/token.json`
2. 提交 PR
3. 开发跑 `pnpm tokens:sync` → 验证生成产物
4. 打开 `docs/claude/design-system.html` 在浏览器肉眼检查 3 个主题

---

## 7. 业务代码规范

### 7.1 用 colorPalette（推荐）

```tsx
<Button colorPalette="primary">主操作</Button>
<Button colorPalette="danger" variant="outline">删除</Button>
<Badge colorPalette="success">已通过</Badge>
<Alert colorPalette="warning">注意事项</Alert>
```

**优点**：自动适配所有 37 个 v3 组件、自动跟随主题切换。

### 7.2 直接读 palette 键（受控场景）

```tsx
<Box bg="primary.subtle" color="primary.fg" borderColor="primary.border">
  品牌色卡片
</Box>
```

**仅允许**这 8 个键名后缀：`solid / contrast / fg / subtle / muted / emphasized / border / focusRing`。

### 7.3 禁止

```tsx
// ❌ 禁止直接用色阶
<Box bg="blue.500" color="gray.700" />

// ❌ 禁止硬编码 hex
<Box bg="#3B82F6" />

// ❌ 禁止跳过 palette 用 core
<Box bg="core.color.primary.600" />
```

ESLint 规则 `no-raw-color`（见 `packages/config/rules/no-raw-color.js`）拦截 **JSX 颜色属性的字面量字符串**（如 `<Box bg="blue.500" />`）。
**未覆盖**的逃逸路径（PR 评审需人工把关）：
- `sx={{ ... }}`、`style={{ ... }}`、`css={{ ... }}` 内部
- 变量赋值（`const c = 'blue.500'; <Box bg={c} />`）
- Chakra recipe 配置文件
- 非 JSX 代码（hooks、utils 返回的颜色）

后续若需更强约束，方向是 semgrep / AST 全量扫，但当前不做。

### 7.4 例外

仅以下文件可以用色阶 / hex：
- `apps/web/src/styles/tokens/**`（token 定义本身）
- `apps/web/src/app/providers.tsx`（系统初始化）
- `scripts/**`（构建脚本）
- 生成的文件（`__generated.*`）

---

## 8. 主题切换

### 8.1 实现方式

**真源是 CSS 变量**：`tokens.css` 里 `:root` / `[data-theme='dark']` / `[data-theme='sepia']` 各定义一份完整变量集。

Chakra `semanticTokens` **只持有引用**：
```ts
// providers.tsx
const semanticTokens = {
  colors: {
    primary: {
      solid:    { value: 'var(--palette-primary-solid)' },
      contrast: { value: 'var(--palette-primary-contrast)' },
      // ...
    },
    bg: { canvas: { value: 'var(--bg-canvas)' } },
    fg: { default: { value: 'var(--fg-default)' } },
  },
};
```

`tokens.css`：
```css
:root, [data-theme='light'] { --palette-primary-solid: #2849E8; ... }
[data-theme='dark']         { --palette-primary-solid: #3D66F5; ... }
[data-theme='sepia']        { --palette-primary-solid: #5C4530; ... }
```

切换 `<html data-theme="sepia">` → CSS 变量重算 → Chakra 组件 + 自定义 CSS + 预览页**同时**变色。**不再使用** Chakra 原生的 `base/_dark` 二分配置。

### 8.2 主题集合

最少必须支持：
- `light`（默认）
- `dark`
- `auto`（跟随系统 `prefers-color-scheme`）

可选：
- `sepia`（米黄阅读主题）

### 8.3 FOUC 防御

在 `<head>` 注入同步脚本，先读 localStorage 设置 `data-theme`，再加载 React。

---

## 9. 工业界对比快查

仅作参考，本项目执行 Chakra v3 + 8 键模型。

| 系统 | 每色族键数 | palette/scale 数 | 设计师成本（有 helper 后）| 适用规模 |
|---|---|---|---|---|
| Chakra v3 | 8 | 5–8 | 低 | 小-中团队 ✅ |
| Radix | 12 | 30+（含暖冷灰）| 中 | 中-大团队 |
| Material 3 | 13 tone + 30 role | 5 固定 | 低（HCT 自动）| 跨平台 / 大团队 |
| Polaris | 不暴露 palette | — | 极高（150 角色背诵）| 巨型团队 |

---

## 10. 规范变更流程

修改本文档：
1. 提 issue 说明动机（视觉问题 / 协作问题 / 性能问题）
2. 跑过新规范的 spike（至少改一个 palette / 一个组件验证）
3. 同时更新 `add-palette.ts` 的 conventions 表
4. 跑一遍现有 palette 的 migration（保证旧 palette 仍然能跑）
5. PR 合并 → 通知设计师

---

## 11. 不在本规范内的事

明确**不管**的范围：

- 字体 / 字号 / 字重（见 `textStyle` 部分，独立规范）
- 间距 / 圆角 / 阴影（见 `core` 下的 spacing / radii / shadow，独立规范）
- 动画 / 过渡曲线（见 `motion` 部分，独立规范）
- 图标系统（用 Lucide / Phosphor，不走 token 化）
- 业务逻辑色（图表数据色、状态可视化色等，单独定）
