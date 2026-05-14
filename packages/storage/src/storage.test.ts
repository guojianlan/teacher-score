import { describe, it, expect } from 'vitest';
import { buildStorageKey, assertKeyBelongsToOrg } from './index';

describe('storage key safety', () => {
  it('builds keys prefixed with organizationId', () => {
    const key = buildStorageKey({ organizationId: 'org_A', type: 'student-answer', ext: 'jpg' });
    expect(key.startsWith('org_A/')).toBe(true);
    expect(/^org_A\/\d{4}\/\d{2}\/student-answer\/[0-9A-Z]{26}\.jpg$/.test(key)).toBe(true);
  });

  it('rejects empty organizationId', () => {
    expect(() => buildStorageKey({ organizationId: '', type: 'student-answer', ext: 'jpg' })).toThrow();
  });

  it('assertKeyBelongsToOrg accepts matching prefix', () => {
    expect(() => assertKeyBelongsToOrg('org_A/2026/05/student-answer/foo.jpg', 'org_A')).not.toThrow();
  });

  it('assertKeyBelongsToOrg rejects cross-org access', () => {
    expect(() => assertKeyBelongsToOrg('org_A/2026/05/student-answer/foo.jpg', 'org_B')).toThrow(
      /forbidden/,
    );
  });
});
