/**
 * ESLint rule: forbid business code from using raw color values or base color
 * scale tokens in chakra-style props.
 *
 * Bans:
 *   <Box bg="gray.500" />            // base 色阶
 *   <Text color="#1F2937" />         // hex
 *   <Box borderColor="rgb(...)" />   // raw rgba
 *
 * Allows:
 *   <Box bg="bg.surface" />          // semantic
 *   <Text color="fg.muted" />        // semantic
 *   <Button colorScheme="brand" />   // chakra scheme（map 在 theme 里）
 *
 * 例外：
 *   - tokens/ 目录（生成 + 配置）
 *   - providers.tsx（theme 装配）
 *   - *.test.tsx / *.spec.tsx
 *   - 注释里标 `// eslint-disable-next-line teacher-score/no-raw-color` 的行
 */

const COLOR_PROPS = new Set([
  'color',
  'bg',
  'backgroundColor',
  'background',
  'borderColor',
  'borderTopColor',
  'borderRightColor',
  'borderBottomColor',
  'borderLeftColor',
  'fill',
  'stroke',
  'outlineColor',
  'caretColor',
]);

// 被允许的 base 色阶 family —— 业务代码就是不该直接写这些
const BASE_FAMILIES = new Set([
  'gray', 'blue', 'green', 'red', 'orange', 'yellow',
  'blackAlpha', 'whiteAlpha', 'brand',
]);

// 这些 family.step 命名是合法的（semantic）—— 注意都不含 base family
// 我们用反向逻辑：如果值是 `<base-family>.<digit>`，就是违规
const RAW_VALUE_RE = /^(#[0-9a-fA-F]{3,8}|rgb|rgba|hsl|hsla)\b/;

function isViolation(value) {
  if (typeof value !== 'string') return null;
  // 1) hex / rgb / rgba / hsl —— 直接违规
  if (RAW_VALUE_RE.test(value)) return 'raw-color';
  // 2) base 色阶：`gray.500` / `blue.600` 等
  const m = value.match(/^([a-zA-Z]+)\.(\d+)$/);
  if (m && BASE_FAMILIES.has(m[1])) return 'base-scale';
  return null;
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Forbid raw color values (hex/rgb) and base color scales in JSX color props. ' +
        'Use semantic tokens (bg.*, fg.*, border.*, interactive.*, status.*) instead.',
    },
    schema: [],
    messages: {
      rawColor:
        'Raw color value "{{value}}" is forbidden. Use a semantic token: `bg.canvas` / `fg.default` / `interactive.primary.bg` / `status.danger.fg` / ...',
      baseScale:
        'Base color "{{value}}" is forbidden in business code (base = primitives). Use a semantic token instead: `bg.*` / `fg.*` / `border.*` / `interactive.*` / `status.*`.',
    },
  },
  create(context) {
    return {
      JSXAttribute(node) {
        const name = node.name?.name;
        if (typeof name !== 'string' || !COLOR_PROPS.has(name)) return;
        const value = node.value;
        if (!value) return;

        // <Box bg="gray.500" />
        if (value.type === 'Literal' && typeof value.value === 'string') {
          const kind = isViolation(value.value);
          if (kind === 'raw-color') {
            context.report({ node: value, messageId: 'rawColor', data: { value: value.value } });
          } else if (kind === 'base-scale') {
            context.report({ node: value, messageId: 'baseScale', data: { value: value.value } });
          }
        }

        // <Box bg={"gray.500"} /> 或 <Box bg={`#${...}`} />
        if (
          value.type === 'JSXExpressionContainer' &&
          value.expression?.type === 'Literal' &&
          typeof value.expression.value === 'string'
        ) {
          const v = value.expression.value;
          const kind = isViolation(v);
          if (kind === 'raw-color') {
            context.report({ node: value.expression, messageId: 'rawColor', data: { value: v } });
          } else if (kind === 'base-scale') {
            context.report({ node: value.expression, messageId: 'baseScale', data: { value: v } });
          }
        }
      },
    };
  },
};
