import { Hono } from 'hono';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import sharp from 'sharp';
import {
  assertKeyBelongsToOrg,
  buildStorageKey,
  createStorageProvider,
} from '@teacher-score/storage';

// Per §十.7: 手机扫码拍照 H5。
//   1. desktop POST /api/mobile-capture/start  -> { sessionId, token, expiresAt }
//   2. desktop renders QR pointing to `/m/capture?s=<sessionId>&t=<token>` (mobile H5).
//   3. mobile uploads files to POST /api/mobile-capture/upload?s&t (HMAC signed).
//   4. desktop polls GET /api/mobile-capture/poll?s -> { keys[] }.
//
// HMAC keyed by SHARE_LINK_SECRET (reuse since same trust boundary).
// Session is bound to a specific organizationId via the desktop user's active org.

export const mobileCaptureRoute = new Hono();

const sessions = new Map<
  string,
  { organizationId: string; userId: string; createdAt: number; keys: string[] }
>();
const SESSION_TTL_MS = 15 * 60 * 1000;
const ALLOWED_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heic',
};
const MAX_BYTES = 10 * 1024 * 1024;
const storage = createStorageProvider();

function getSecret(): string {
  const s = process.env.SHARE_LINK_SECRET;
  if (!s) throw new Error('SHARE_LINK_SECRET is required for mobile capture');
  return s;
}

function sign(material: string): string {
  return createHmac('sha256', getSecret()).update(material).digest('hex');
}

function verify(material: string, sig: string): boolean {
  try {
    const a = Buffer.from(sign(material), 'hex');
    const b = Buffer.from(sig, 'hex');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function gc() {
  const now = Date.now();
  for (const [k, v] of sessions) {
    if (now - v.createdAt > SESSION_TTL_MS) sessions.delete(k);
  }
}

mobileCaptureRoute.post('/start', async (c) => {
  const orgId = c.get('activeOrganizationId');
  const session = c.get('session');
  if (!orgId || !session) return c.json({ error: 'unauthorized' }, 401);
  if (!process.env.SHARE_LINK_SECRET) {
    return c.json({ error: 'mobile_capture_disabled' }, 503);
  }
  gc();
  const sessionId = randomBytes(16).toString('hex');
  sessions.set(sessionId, {
    organizationId: orgId,
    userId: session.userId,
    createdAt: Date.now(),
    keys: [],
  });
  const token = sign(sessionId);
  const appUrl = process.env.APP_URL ?? '';
  const url = `${appUrl}/m/capture?s=${sessionId}&t=${token}`;
  return c.json({
    sessionId,
    token,
    url,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
  });
});

mobileCaptureRoute.post('/upload', async (c) => {
  gc();
  const q = new URL(c.req.url).searchParams;
  const sessionId = q.get('s') ?? '';
  const token = q.get('t') ?? '';
  if (!sessionId || !verify(sessionId, token)) return c.json({ error: 'bad_token' }, 403);

  const sess = sessions.get(sessionId);
  if (!sess) return c.json({ error: 'session_expired' }, 410);
  if (Date.now() - sess.createdAt > SESSION_TTL_MS) {
    sessions.delete(sessionId);
    return c.json({ error: 'session_expired' }, 410);
  }

  const form = await c.req.formData().catch(() => null);
  if (!form) return c.json({ error: 'bad_request' }, 400);
  const file = form.get('file');
  if (!(file instanceof File)) return c.json({ error: 'no_file' }, 400);
  if (file.size > MAX_BYTES) return c.json({ error: 'payload_too_large' }, 413);
  if (!ALLOWED_MIME[file.type]) return c.json({ error: 'unsupported_media_type' }, 415);

  const buf = Buffer.from(await file.arrayBuffer());
  // Re-encode with sharp to strip EXIF/GPS (red line).
  const cleaned = await sharp(buf).jpeg({ quality: 92 }).withMetadata({}).toBuffer();
  const key = buildStorageKey({
    organizationId: sess.organizationId,
    type: 'student-answer',
    ext: 'jpg',
  });
  assertKeyBelongsToOrg(key, sess.organizationId);
  await storage.put({ key, body: cleaned, contentType: 'image/jpeg' });
  sess.keys.push(key);
  return c.json({ ok: true, key });
});

mobileCaptureRoute.get('/poll', async (c) => {
  gc();
  const orgId = c.get('activeOrganizationId');
  const session = c.get('session');
  if (!orgId || !session) return c.json({ error: 'unauthorized' }, 401);
  const q = new URL(c.req.url).searchParams;
  const sessionId = q.get('s') ?? '';
  const sess = sessions.get(sessionId);
  if (!sess) return c.json({ error: 'not_found' }, 404);
  if (sess.userId !== session.userId || sess.organizationId !== orgId) {
    return c.json({ error: 'forbidden' }, 403);
  }
  return c.json({ keys: sess.keys, expiresAt: new Date(sess.createdAt + SESSION_TTL_MS).toISOString() });
});

mobileCaptureRoute.post('/finish', async (c) => {
  const session = c.get('session');
  const orgId = c.get('activeOrganizationId');
  if (!session || !orgId) return c.json({ error: 'unauthorized' }, 401);
  const body = await c.req.json().catch(() => null);
  const sessionId = (body as { sessionId?: string })?.sessionId ?? '';
  const sess = sessions.get(sessionId);
  if (!sess || sess.userId !== session.userId || sess.organizationId !== orgId) {
    return c.json({ error: 'not_found' }, 404);
  }
  sessions.delete(sessionId);
  return c.json({ ok: true });
});
