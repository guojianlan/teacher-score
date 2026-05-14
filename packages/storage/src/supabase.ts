import type { StorageProvider } from './index';

// Skeleton — wired in stage 0b/1b deploy. Keep types stable.
export class SupabaseStorageProvider implements StorageProvider {
  constructor(
    private opts: {
      url: string;
      serviceRoleKey: string;
      bucket: string;
    },
  ) {}

  private endpoint(key: string) {
    return `${this.opts.url}/storage/v1/object/${this.opts.bucket}/${encodeURIComponent(key)}`;
  }

  async put(input: { key: string; body: Buffer | Uint8Array; contentType: string }) {
    const res = await fetch(this.endpoint(input.key), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.opts.serviceRoleKey}`,
        'Content-Type': input.contentType,
        'x-upsert': 'true',
      },
      body: input.body as BodyInit,
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Supabase put failed: ${res.status} ${t}`);
    }
    return { key: input.key, size: input.body.byteLength };
  }

  async get(key: string) {
    const res = await fetch(this.endpoint(key), {
      headers: { Authorization: `Bearer ${this.opts.serviceRoleKey}` },
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Supabase get failed: ${res.status}`);
    const body = Buffer.from(await res.arrayBuffer());
    return { body, contentType: res.headers.get('content-type') ?? 'application/octet-stream' };
  }

  async signedUrl(key: string, opts?: { expiresInSec?: number }) {
    const expires = opts?.expiresInSec ?? 60 * 60;
    const res = await fetch(
      `${this.opts.url}/storage/v1/object/sign/${this.opts.bucket}/${encodeURIComponent(key)}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.opts.serviceRoleKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ expiresIn: expires }),
      },
    );
    if (!res.ok) throw new Error(`Supabase signed URL failed: ${res.status}`);
    const data = (await res.json()) as { signedURL?: string };
    if (!data.signedURL) throw new Error('Supabase signed URL missing');
    return `${this.opts.url}/storage/v1${data.signedURL}`;
  }

  async delete(key: string) {
    const res = await fetch(this.endpoint(key), {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${this.opts.serviceRoleKey}` },
    });
    if (!res.ok && res.status !== 404) {
      throw new Error(`Supabase delete failed: ${res.status}`);
    }
  }
}
