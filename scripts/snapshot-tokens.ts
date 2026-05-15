#!/usr/bin/env tsx
/**
 * Token 快照工具。
 *
 * 用法：
 *   pnpm tokens:snapshot save <label>     # 保存当前 token.json 为快照
 *   pnpm tokens:snapshot list             # 列出所有快照
 *   pnpm tokens:snapshot diff <label>     # 跟当前对比（palette 锚点 + 8 键改动）
 *   pnpm tokens:snapshot restore <label>  # 用快照覆盖 token.json（重要改动前先 snapshot save）
 *
 * 快照存在：docs/claude/snapshots/<YYYY-MM-DD>-<label>.json
 * 文件名按时间排序，最新的在最后。
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';

const REPO = path.resolve(__dirname, '..');
const TOKEN_PATH = path.join(REPO, 'docs/claude/token.json');
const SNAPSHOTS_DIR = path.join(REPO, 'docs/claude/snapshots');

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function safeLabel(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
}

async function cmd_save(label?: string) {
  if (!label) {
    console.error('Usage: pnpm tokens:snapshot save <label>');
    console.error('Example: pnpm tokens:snapshot save teal-default');
    process.exit(1);
  }
  await fs.mkdir(SNAPSHOTS_DIR, { recursive: true });
  const slug = safeLabel(label);
  const fname = `${today()}-${slug}.json`;
  const dest = path.join(SNAPSHOTS_DIR, fname);

  const content = await fs.readFile(TOKEN_PATH, 'utf8');
  await fs.writeFile(dest, content);
  console.log(`✓ 快照已保存：docs/claude/snapshots/${fname}`);
}

async function cmd_list() {
  try {
    const files = (await fs.readdir(SNAPSHOTS_DIR))
      .filter((f) => f.endsWith('.json'))
      .sort();
    if (files.length === 0) {
      console.log('(无快照)');
      return;
    }
    console.log(`快照列表（${files.length} 个）：\n`);
    for (const f of files) {
      const fpath = path.join(SNAPSHOTS_DIR, f);
      const stat = await fs.stat(fpath);
      const sizeKb = (stat.size / 1024).toFixed(1);
      console.log(`  ${f}  ${sizeKb} KB`);
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      console.log('(无快照目录，先跑：pnpm tokens:snapshot save <label>)');
    } else throw err;
  }
}

async function findSnapshotByLabel(label: string): Promise<string | null> {
  const slug = safeLabel(label);
  const files = await fs.readdir(SNAPSHOTS_DIR);
  // 精确匹配 → 后缀匹配 label
  const matches = files.filter((f) => f.endsWith('.json') && f.includes(slug));
  if (matches.length === 0) return null;
  // 多个匹配选最新（按文件名排序最大者）
  matches.sort();
  return matches[matches.length - 1]!;
}

async function cmd_diff(label?: string) {
  if (!label) {
    console.error('Usage: pnpm tokens:snapshot diff <label>');
    process.exit(1);
  }
  const fname = await findSnapshotByLabel(label);
  if (!fname) {
    console.error(`✗ 找不到快照：${label}`);
    process.exit(1);
  }

  const cur = JSON.parse(await fs.readFile(TOKEN_PATH, 'utf8'));
  const snap = JSON.parse(await fs.readFile(path.join(SNAPSHOTS_DIR, fname), 'utf8'));

  console.log(`对比：当前 vs 快照 ${fname}\n`);

  // 比 core.color 色族列表
  const curFamilies = new Set(Object.keys(cur.core?.color ?? {}));
  const snapFamilies = new Set(Object.keys(snap.core?.color ?? {}));
  const added = [...curFamilies].filter((x) => !snapFamilies.has(x));
  const removed = [...snapFamilies].filter((x) => !curFamilies.has(x));
  if (added.length || removed.length) {
    console.log('core.color 色族变化：');
    added.forEach((x) => console.log(`  + ${x} (新增)`));
    removed.forEach((x) => console.log(`  - ${x} (删除)`));
    console.log();
  }

  // 比 palette 列表 + 8 键引用
  for (const theme of ['light', 'dark', 'sepia']) {
    const curP = (cur[theme]?.palette ?? {}) as Record<string, Record<string, { $value: string }>>;
    const snapP = (snap[theme]?.palette ?? {}) as Record<string, Record<string, { $value: string }>>;
    const curNames = new Set(Object.keys(curP));
    const snapNames = new Set(Object.keys(snapP));
    const palAdded = [...curNames].filter((x) => !snapNames.has(x));
    const palRemoved = [...snapNames].filter((x) => !curNames.has(x));
    const palCommon = [...curNames].filter((x) => snapNames.has(x));

    const themeChanges: string[] = [];
    palAdded.forEach((x) => themeChanges.push(`  + palette.${x} (新增)`));
    palRemoved.forEach((x) => themeChanges.push(`  - palette.${x} (删除)`));
    for (const name of palCommon) {
      for (const key of Object.keys(curP[name]!)) {
        const a = curP[name]?.[key]?.$value;
        const b = snapP[name]?.[key]?.$value;
        if (a !== b) themeChanges.push(`  ~ palette.${name}.${key}: ${b} → ${a}`);
      }
    }
    if (themeChanges.length) {
      console.log(`${theme}:`);
      themeChanges.forEach((l) => console.log(l));
      console.log();
    }
  }
}

async function cmd_restore(label?: string) {
  if (!label) {
    console.error('Usage: pnpm tokens:snapshot restore <label>');
    process.exit(1);
  }
  const fname = await findSnapshotByLabel(label);
  if (!fname) {
    console.error(`✗ 找不到快照：${label}`);
    process.exit(1);
  }
  // 还原前先自动 save 一份当前状态（防止冲掉手头修改）
  const auto = `auto-before-restore-${safeLabel(label)}`;
  await cmd_save(auto);

  const snap = await fs.readFile(path.join(SNAPSHOTS_DIR, fname), 'utf8');
  await fs.writeFile(TOKEN_PATH, snap);
  console.log(`\n✓ 已用 ${fname} 覆盖 token.json`);
  console.log(`  当前状态已自动备份为：*-${auto}.json`);
  console.log(`  下一步：pnpm tokens:sync`);
}

async function main() {
  const [sub, label] = process.argv.slice(2);
  switch (sub) {
    case 'save':    return cmd_save(label);
    case 'list':    return cmd_list();
    case 'diff':    return cmd_diff(label);
    case 'restore': return cmd_restore(label);
    default:
      console.error('Usage: pnpm tokens:snapshot <save|list|diff|restore> [label]');
      process.exit(1);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
