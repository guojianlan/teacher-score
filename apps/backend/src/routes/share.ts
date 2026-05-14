import { Hono } from 'hono';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '@teacher-score/db';
import * as schema from '@teacher-score/db/schema';

// Per §十.10: 家长 7 天签名分享链接。
// 链接结构：/share/grading/<gradingId>?o=<orgId>&exp=<unix>&sig=<hmac>
// 签名材料：`${gradingId}.${orgId}.${exp}`，HMAC-SHA256 with SHARE_LINK_SECRET。
//
// Public read-only view: no cookies required. Signature + expiry are the only auth.
// Per checklist red lines: student names stripped from public view; replace with [学生].

export const shareRoute = new Hono();

function getSecret(): string {
  const s = process.env.SHARE_LINK_SECRET;
  if (!s) throw new Error('SHARE_LINK_SECRET is not configured');
  return s;
}

function sign(material: string): string {
  return createHmac('sha256', getSecret()).update(material).digest('hex');
}

function verify(material: string, sig: string): boolean {
  try {
    const expected = Buffer.from(sign(material), 'hex');
    const provided = Buffer.from(sig, 'hex');
    if (expected.length !== provided.length) return false;
    return timingSafeEqual(expected, provided);
  } catch {
    return false;
  }
}

shareRoute.post('/create/grading/:id', async (c) => {
  const orgId = c.get('activeOrganizationId');
  if (!orgId) return c.json({ error: 'no_active_organization' }, 403);
  const id = c.req.param('id');
  if (!process.env.SHARE_LINK_SECRET) {
    return c.json({ error: 'share_disabled', message: 'SHARE_LINK_SECRET not configured' }, 503);
  }

  const rows = await db
    .select()
    .from(schema.gradingRecords)
    .where(and(eq(schema.gradingRecords.id, id), eq(schema.gradingRecords.organizationId, orgId)))
    .limit(1);
  if (rows.length === 0) return c.json({ error: 'not_found' }, 404);
  if (rows[0]!.status !== 'completed') return c.json({ error: 'not_completed' }, 400);

  const exp = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;
  const material = `${id}.${orgId}.${exp}`;
  const sig = sign(material);
  const url = `${process.env.APP_URL ?? ''}/share/grading/${id}?o=${encodeURIComponent(
    orgId,
  )}&exp=${exp}&sig=${sig}`;
  return c.json({ url, expiresAt: new Date(exp * 1000).toISOString() });
});

// Public read endpoint — no session required.
shareRoute.get('/grading/:id', async (c) => {
  const id = c.req.param('id');
  const q = new URL(c.req.url).searchParams;
  const orgId = q.get('o');
  const exp = Number(q.get('exp'));
  const sig = q.get('sig') ?? '';
  if (!orgId || !exp || !sig) return c.json({ error: 'bad_signature' }, 400);
  if (Date.now() / 1000 > exp) return c.json({ error: 'link_expired' }, 410);
  if (!verify(`${id}.${orgId}.${exp}`, sig)) return c.json({ error: 'bad_signature' }, 403);

  const rows = await db
    .select()
    .from(schema.gradingRecords)
    .where(and(eq(schema.gradingRecords.id, id), eq(schema.gradingRecords.organizationId, orgId)))
    .limit(1);
  if (rows.length === 0) return c.json({ error: 'not_found' }, 404);
  const r = rows[0]!;

  // Per red lines: don't include student name in the public view.
  return c.json({
    subject: r.subject,
    totalScore: r.totalScore,
    maxScore: r.maxScore,
    overallComment: r.overallComment,
    results: r.results,
    completedAt: r.completedAt,
  });
});
