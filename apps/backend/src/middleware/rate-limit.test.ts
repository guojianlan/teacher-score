import { describe, it, expect, beforeEach } from 'vitest';
import { consumeCustom, _resetRateLimitsForTests } from './rate-limit';

describe('rate limit (in-process token bucket)', () => {
  beforeEach(() => _resetRateLimitsForTests());

  it('allows up to max requests then 429s', () => {
    const key = 'test-user';
    let allowed = 0;
    for (let i = 0; i < 5; i++) if (consumeCustom(key, 3, 60_000)) allowed++;
    expect(allowed).toBe(3);
  });

  it('isolates different keys', () => {
    expect(consumeCustom('a', 1, 60_000)).toBe(true);
    expect(consumeCustom('a', 1, 60_000)).toBe(false);
    expect(consumeCustom('b', 1, 60_000)).toBe(true);
  });
});
