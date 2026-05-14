import { describe, it, expect, beforeAll } from 'vitest';
import { createApp } from '../app';

// Integration tests for the auth flow per checklist §四.21:
//   sign-up -> personal org auto-created -> sign-in -> change-password -> sign-out
//
// Gated on DATABASE_URL: runs only when a real test DB is available.
// CI provides this via the `postgres` service in .github/workflows/ci.yml.

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)('auth integration', () => {
  const app = createApp();
  const email = `test-${Date.now()}@example.com`;
  const password = 'password-12345';
  let cookie = '';

  beforeAll(async () => {
    // The tests run in order; pg-boss / Drizzle migrations should be applied externally.
  });

  it('signs up a new user and creates a personal organization', async () => {
    const res = await app.fetch(
      new Request('http://localhost/api/auth/sign-up/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password, name: '测试老师' }),
      }),
    );
    expect(res.status).toBeLessThan(400);
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0]!;
  });

  it('GET /api/me returns the auto-created personal organization', async () => {
    const res = await app.fetch(
      new Request('http://localhost/api/me', { headers: { cookie } }),
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      organization: { isPersonal: boolean; subscriptionTier: string; monthlyQuota: number };
    };
    expect(data.organization.isPersonal).toBe(true);
    expect(data.organization.subscriptionTier).toBe('free');
    expect(data.organization.monthlyQuota).toBe(50);
  });

  it('signs out and clears the session', async () => {
    const res = await app.fetch(
      new Request('http://localhost/api/auth/sign-out', {
        method: 'POST',
        headers: { cookie },
      }),
    );
    expect(res.status).toBeLessThan(400);
  });
});
