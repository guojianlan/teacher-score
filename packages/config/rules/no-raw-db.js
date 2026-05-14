/**
 * ESLint rule: forbid business code from importing the raw `db` client.
 * All business reads/writes must go through scopedDb(organizationId).
 */
export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Forbid importing the raw db client from business code; use scopedDb instead.',
    },
    schema: [],
    messages: {
      noRawDb:
        'Importing raw `db` is forbidden in business code. Use `scopedDb(organizationId)` from @teacher-score/db.',
    },
  },
  create(context) {
    return {
      ImportDeclaration(node) {
        const source = node.source.value;
        if (typeof source !== 'string') return;
        const fromDbPackage =
          source === '@teacher-score/db' ||
          source === '@teacher-score/db/client' ||
          source.endsWith('/packages/db') ||
          source.endsWith('/packages/db/client');
        if (!fromDbPackage) return;
        for (const spec of node.specifiers) {
          if (
            spec.type === 'ImportSpecifier' &&
            spec.imported.type === 'Identifier' &&
            spec.imported.name === 'db'
          ) {
            context.report({ node: spec, messageId: 'noRawDb' });
          }
          if (spec.type === 'ImportDefaultSpecifier' && spec.local.name === 'db') {
            context.report({ node: spec, messageId: 'noRawDb' });
          }
        }
      },
    };
  },
};
