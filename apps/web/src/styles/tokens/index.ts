/**
 * Public token API.
 *
 * 真正的值来自 docs/claude/token.json (W3C DTCG)。
 * sync 流程：编辑 JSON → `pnpm tokens:sync` → __generated.ts 重新生成 → import 同步生效。
 */

export * from './__generated';
