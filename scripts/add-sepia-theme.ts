#!/usr/bin/env tsx
/**
 * 一次性脚本：往 docs/claude/token.json 加 sepia theme（暖米黄纸质风）。
 * 加 core.color.brown 色阶 + 顶层 sepia set + 登记 $themes / $metadata。
 *
 * 跑：pnpm exec tsx scripts/add-sepia-theme.ts
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';

const TOKEN_PATH = path.resolve(__dirname, '../docs/claude/token.json');

type Dtcg = { $type: string; $value: unknown; $description?: string };
const dtcg = (type: string, value: unknown, description?: string): Dtcg =>
  description ? { $type: type, $value: value, $description: description } : { $type: type, $value: value };

const brown = {
  '50': '#FAF7F0',
  '100': '#F5EBE0',
  '200': '#E8D5C4',
  '300': '#D9B79C',
  '400': '#C39477',
  '500': '#A07758',
  '600': '#7A5A40',
  '700': '#5C4530',
  '800': '#443322',
  '900': '#2F2418',
  '950': '#1A140C',
};

const SCALE_HINTS: Record<string, string> = {
  '50': 'app 底色 / 卡片底', '100': 'UI 元素背景', '200': '弱边线',
  '300': '边线 emphasized', '400': 'disabled fg / placeholder',
  '500': '低对比文本', '600': '主操作 solid (按钮底)',
  '700': '主操作 hover', '800': '主操作 active',
  '900': '高对比文本', '950': '反色背景 / 最深',
};

const ref = (path: string) => path;

async function main() {
  const json = JSON.parse(await fs.readFile(TOKEN_PATH, 'utf8'));

  // 1. brown 色阶加进 core
  if (!json.core.color.brown) {
    const brownDtcg: Record<string, Dtcg> = {};
    for (const [k, v] of Object.entries(brown)) {
      brownDtcg[k] = dtcg('color', v, `brown.${k} · ${SCALE_HINTS[k] ?? ''}`);
    }
    json.core.color.brown = brownDtcg;
    console.log('✓ 添加 core.color.brown 11 档色阶');
  }

  // 2. sepia theme set —— 暖米黄纸质风，brown 作为主色
  json.sepia = {
    bg: {
      canvas: dtcg('color', '{core.color.brown.50}', 'sepia · 页面底，暖米色'),
      surface: dtcg('color', '{core.color.white}', 'sepia · 卡片/面板，纯白对比'),
      surfaceSubtle: dtcg('color', '{core.color.brown.50}', 'sepia · 次级 surface'),
      surfaceHover: dtcg('color', '{core.color.brown.100}', 'sepia · hover 态'),
      muted: dtcg('color', '{core.color.brown.100}', 'sepia · 静默色块'),
      inverse: dtcg('color', '{core.color.brown.900}', 'sepia · 反色背景'),
      overlay: dtcg('color', 'rgba(26,20,12,0.45)', 'sepia · 弹层遮罩，暖暗调'),
      brand: dtcg('color', '{core.color.brown.700}', 'sepia · 品牌主色，深棕'),
      brandSubtle: dtcg('color', '{core.color.brown.100}', 'sepia · 品牌色淡'),
      brandMuted: dtcg('color', '{core.color.brown.200}', 'sepia · 品牌色 muted'),
    },
    fg: {
      default: dtcg('color', '{core.color.brown.900}', 'sepia · 主文本'),
      muted: dtcg('color', '{core.color.brown.700}', 'sepia · 副文本'),
      subtle: dtcg('color', '{core.color.brown.500}', 'sepia · 弱化文本'),
      disabled: dtcg('color', '{core.color.brown.400}', 'sepia · 禁用'),
      inverse: dtcg('color', '{core.color.brown.50}', 'sepia · 反色文本'),
      onBrand: dtcg('color', '{core.color.brown.50}', 'sepia · brand 背景上的前景色'),
      brand: dtcg('color', '{core.color.brown.700}', 'sepia · brand 文本'),
      link: dtcg('color', '{core.color.brown.700}', 'sepia · 链接'),
      linkHover: dtcg('color', '{core.color.brown.800}', 'sepia · 链接 hover'),
    },
    border: {
      default: dtcg('color', '{core.color.brown.200}', 'sepia · 默认边线'),
      subtle: dtcg('color', '{core.color.brown.100}', 'sepia · 弱边线'),
      strong: dtcg('color', '{core.color.brown.300}', 'sepia · 强边线'),
      focus: dtcg('color', '{core.color.brown.500}', 'sepia · focus 边'),
      brand: dtcg('color', '{core.color.brown.700}', 'sepia · 品牌边'),
    },
    interactive: {
      primary: {
        bg: dtcg('color', '{core.color.brown.700}', 'sepia · 主按钮底'),
        bgHover: dtcg('color', '{core.color.brown.800}', 'sepia · 主按钮 hover'),
        bgActive: dtcg('color', '{core.color.brown.900}', 'sepia · 主按钮 active'),
        fg: dtcg('color', '{core.color.brown.50}', 'sepia · 主按钮文字'),
        border: dtcg('color', '{core.color.brown.700}', 'sepia · 主按钮边'),
      },
      secondary: {
        bg: dtcg('color', '{core.color.white}', 'sepia · 次按钮底'),
        bgHover: dtcg('color', '{core.color.brown.50}', 'sepia · 次按钮 hover'),
        bgActive: dtcg('color', '{core.color.brown.100}', 'sepia · 次按钮 active'),
        fg: dtcg('color', '{core.color.brown.900}', 'sepia · 次按钮文字'),
        border: dtcg('color', '{core.color.brown.300}', 'sepia · 次按钮边'),
      },
      ghost: {
        bg: dtcg('color', '{core.color.transparent}', 'sepia · ghost 底'),
        bgHover: dtcg('color', '{core.color.brown.100}', 'sepia · ghost hover'),
        bgActive: dtcg('color', '{core.color.brown.200}', 'sepia · ghost active'),
        fg: dtcg('color', '{core.color.brown.700}', 'sepia · ghost 文字'),
        border: dtcg('color', '{core.color.transparent}', 'sepia · ghost 边'),
      },
      danger: {
        bg: dtcg('color', '{core.color.red.600}', 'sepia · danger 底（统一红）'),
        bgHover: dtcg('color', '{core.color.red.700}', 'sepia · danger hover'),
        bgActive: dtcg('color', '{core.color.red.800}', 'sepia · danger active'),
        fg: dtcg('color', '{core.color.white}', 'sepia · danger 文字'),
        border: dtcg('color', '{core.color.red.600}', 'sepia · danger 边'),
      },
    },
    status: {
      info: {
        bg: dtcg('color', '{core.color.blue.50}', 'sepia · info bg'),
        fg: dtcg('color', '{core.color.blue.700}', 'sepia · info fg'),
        border: dtcg('color', '{core.color.blue.200}', 'sepia · info border'),
        solid: dtcg('color', '{core.color.blue.600}', 'sepia · info solid'),
      },
      success: {
        bg: dtcg('color', '{core.color.green.50}', 'sepia · success bg'),
        fg: dtcg('color', '{core.color.green.700}', 'sepia · success fg'),
        border: dtcg('color', '{core.color.green.200}', 'sepia · success border'),
        solid: dtcg('color', '{core.color.green.600}', 'sepia · success solid'),
      },
      warning: {
        bg: dtcg('color', '{core.color.orange.50}', 'sepia · warning bg'),
        fg: dtcg('color', '{core.color.orange.700}', 'sepia · warning fg'),
        border: dtcg('color', '{core.color.orange.200}', 'sepia · warning border'),
        solid: dtcg('color', '{core.color.orange.600}', 'sepia · warning solid'),
      },
      danger: {
        bg: dtcg('color', '{core.color.red.50}', 'sepia · danger bg'),
        fg: dtcg('color', '{core.color.red.700}', 'sepia · danger fg'),
        border: dtcg('color', '{core.color.red.200}', 'sepia · danger border'),
        solid: dtcg('color', '{core.color.red.600}', 'sepia · danger solid'),
      },
      neutral: {
        bg: dtcg('color', '{core.color.brown.100}', 'sepia · neutral bg'),
        fg: dtcg('color', '{core.color.brown.700}', 'sepia · neutral fg'),
        border: dtcg('color', '{core.color.brown.200}', 'sepia · neutral border'),
        solid: dtcg('color', '{core.color.brown.600}', 'sepia · neutral solid'),
      },
    },
    effect: {
      focusRing: dtcg(
        'shadow',
        '0 0 0 3px rgba(160,119,88,0.30)',
        'sepia · focus 状态 3px 环，棕色',
      ),
      focusRingDanger: dtcg(
        'shadow',
        '0 0 0 3px rgba(220,38,38,0.20)',
        'sepia · 危险态 focus 环',
      ),
    },
  };
  console.log('✓ 添加 sepia theme set');

  // 3. 登记 $themes
  if (!Array.isArray(json.$themes)) json.$themes = [];
  if (!json.$themes.find((t: { id: string }) => t.id === 'sepia')) {
    json.$themes.push({
      id: 'sepia',
      name: 'Sepia',
      selectedTokenSets: { core: 'source', sepia: 'enabled', motion: 'source', textStyle: 'source' },
    });
    console.log('✓ 登记 $themes');
  }

  // 4. 更新 tokenSetOrder
  json.$metadata.tokenSetOrder = ['core', 'light', 'dark', 'sepia', 'motion', 'textStyle'];

  await fs.writeFile(TOKEN_PATH, JSON.stringify(json, null, 2));
  console.log(`\n✓ 写入 ${path.relative(process.cwd(), TOKEN_PATH)}`);
  console.log('\n下一步：pnpm tokens:sync');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
