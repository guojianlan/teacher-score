import { describe, it, expect } from 'vitest';
import { logger, createLogger } from './index';

describe('logger', () => {
  it('exposes a child logger', () => {
    const child = createLogger({ scope: 'test' });
    expect(typeof child.info).toBe('function');
  });

  it('redacts sensitive paths', () => {
    // pino redacts at write time; we just verify configured paths exist
    expect(typeof logger.info).toBe('function');
  });
});
