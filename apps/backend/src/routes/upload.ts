import { Hono } from 'hono';
import sharp from 'sharp';
import {
  createStorageProvider,
  buildStorageKey,
  assertKeyBelongsToOrg,
  type StorageFileType,
} from '@teacher-score/storage';

export const uploadRoute = new Hono();

const ALLOWED_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heic',
};
const MAX_BYTES = 10 * 1024 * 1024; // 10MB per §五.3

const ALLOWED_TYPES = new Set<StorageFileType>(['student-answer', 'exam-paper']);

const storage = createStorageProvider();

uploadRoute.post('/', async (c) => {
  const orgId = c.get('activeOrganizationId');
  if (!orgId) return c.json({ error: 'no_active_organization' }, 403);

  const form = await c.req.formData().catch(() => null);
  if (!form) return c.json({ error: 'bad_request', message: 'expected multipart/form-data' }, 400);

  const file = form.get('file');
  const typeRaw = String(form.get('type') ?? 'student-answer');

  if (!ALLOWED_TYPES.has(typeRaw as StorageFileType)) {
    return c.json({ error: 'bad_request', message: 'invalid type' }, 400);
  }
  const type = typeRaw as StorageFileType;

  if (!(file instanceof File)) {
    return c.json({ error: 'bad_request', message: 'file missing' }, 400);
  }
  if (file.size > MAX_BYTES) {
    return c.json({ error: 'payload_too_large', limit: MAX_BYTES }, 413);
  }

  // Server-side MIME validation against File.type (browser-reported) AND magic-byte check via sharp.
  if (!ALLOWED_MIME[file.type]) {
    return c.json({ error: 'unsupported_media_type', got: file.type }, 415);
  }

  const inputBuf = Buffer.from(await file.arrayBuffer());

  // Strip EXIF/GPS by re-encoding with sharp (§三 red line).
  // sharp also probes the actual format from magic bytes; mismatch will throw.
  let cleaned: Buffer;
  let outExt: string;
  let outMime: string;
  try {
    const img = sharp(inputBuf, { failOn: 'truncated' });
    const meta = await img.metadata();
    if (!meta.format) {
      return c.json({ error: 'unsupported_media_type', message: 'unrecognized image' }, 415);
    }
    // Normalize HEIC to JPEG for downstream compatibility; keep others.
    if (meta.format === 'heif' || meta.format === 'heic') {
      cleaned = await sharp(inputBuf).jpeg({ quality: 90 }).withMetadata({}).toBuffer();
      outExt = 'jpg';
      outMime = 'image/jpeg';
    } else if (meta.format === 'png') {
      cleaned = await sharp(inputBuf).png().withMetadata({}).toBuffer();
      outExt = 'png';
      outMime = 'image/png';
    } else if (meta.format === 'webp') {
      cleaned = await sharp(inputBuf).webp().withMetadata({}).toBuffer();
      outExt = 'webp';
      outMime = 'image/webp';
    } else if (meta.format === 'jpeg' || meta.format === 'jpg') {
      cleaned = await sharp(inputBuf).jpeg({ quality: 92 }).withMetadata({}).toBuffer();
      outExt = 'jpg';
      outMime = 'image/jpeg';
    } else {
      return c.json({ error: 'unsupported_media_type', got: meta.format }, 415);
    }
  } catch {
    return c.json({ error: 'unsupported_media_type', message: 'failed to decode image' }, 415);
  }

  const key = buildStorageKey({ organizationId: orgId, type, ext: outExt });
  // Defence-in-depth: ensure key starts with orgId (it should by construction).
  assertKeyBelongsToOrg(key, orgId);

  await storage.put({ key, body: cleaned, contentType: outMime });

  return c.json({ key, size: cleaned.byteLength, contentType: outMime }, 201);
});

// Storage read endpoint — enforces cross-org 403.
uploadRoute.get('/:key{.+}', async (c) => {
  const orgId = c.get('activeOrganizationId');
  if (!orgId) return c.json({ error: 'no_active_organization' }, 403);
  const key = c.req.param('key');

  try {
    assertKeyBelongsToOrg(key, orgId);
  } catch {
    return c.json({ error: 'forbidden' }, 403);
  }

  const file = await storage.get(key);
  if (!file) return c.json({ error: 'not_found' }, 404);
  return new Response(file.body, {
    status: 200,
    headers: { 'content-type': file.contentType },
  });
});
