import type { Context, MiddlewareHandler, Next } from 'hono';

// Per checklist §四.14: stage 0 single-machine PM2 form uses in-process token bucket.
//   - per-user normal API ≤ 100 req/min
//   - global IP ≤ 1000 req/min
// LLM-specific limits live in routes/grade.ts (per §六.9).

interface Bucket {
  tokens: number;
  updatedAt: number;
}

const PER_USER_MAX = Number(process.env.RATE_LIMIT_USER_PER_MIN ?? 100);
const PER_IP_MAX = Number(process.env.RATE_LIMIT_IP_PER_MIN ?? 1000);
const WINDOW_MS = 60_000;

const userBuckets = new Map<string, Bucket>();
const ipBuckets = new Map<string, Bucket>();

function consume(map: Map<string, Bucket>, key: string, max: number): boolean {
  const now = Date.now();
  const b = map.get(key);
  if (!b) {
    map.set(key, { tokens: max - 1, updatedAt: now });
    return true;
  }
  const elapsed = now - b.updatedAt;
  if (elapsed >= WINDOW_MS) {
    b.tokens = max - 1;
    b.updatedAt = now;
    return true;
  }
  if (b.tokens > 0) {
    b.tokens -= 1;
    return true;
  }
  return false;
}

function getClientIp(c: Context): string {
  return (
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ??
    c.req.header('x-real-ip') ??
    'unknown'
  );
}

export const rateLimitMiddleware: MiddlewareHandler = async (c: Context, next: Next) => {
  const ip = getClientIp(c);
  if (!consume(ipBuckets, ip, PER_IP_MAX)) {
    return c.json({ error: 'rate_limited', scope: 'ip', retryAfter: 60 }, 429);
  }
  const session = c.get('session');
  if (session?.userId) {
    if (!consume(userBuckets, session.userId, PER_USER_MAX)) {
      return c.json({ error: 'rate_limited', scope: 'user', retryAfter: 60 }, 429);
    }
  }
  await next();
};

// Per-key custom limiter, used by /api/grade for LLM-specific limits.
const customBuckets = new Map<string, { tokens: number; updatedAt: number; window: number }>();
export function consumeCustom(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const b = customBuckets.get(key);
  if (!b) {
    customBuckets.set(key, { tokens: max - 1, updatedAt: now, window: windowMs });
    return true;
  }
  if (now - b.updatedAt >= b.window) {
    b.tokens = max - 1;
    b.updatedAt = now;
    return true;
  }
  if (b.tokens > 0) {
    b.tokens -= 1;
    return true;
  }
  return false;
}

export function _resetRateLimitsForTests() {
  userBuckets.clear();
  ipBuckets.clear();
  customBuckets.clear();
}
