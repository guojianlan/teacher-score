import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { StorageProvider } from './index';

export class LocalStorageProvider implements StorageProvider {
  constructor(private root: string) {}

  private full(key: string) {
    // Defence-in-depth against path traversal.
    if (key.includes('..') || key.startsWith('/')) {
      throw new Error('invalid storage key');
    }
    return path.join(this.root, key);
  }

  async put(input: { key: string; body: Buffer | Uint8Array; contentType: string }) {
    const full = this.full(input.key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, input.body);
    await fs.writeFile(`${full}.meta`, JSON.stringify({ contentType: input.contentType }));
    return { key: input.key, size: input.body.byteLength };
  }

  async get(key: string) {
    const full = this.full(key);
    try {
      const body = await fs.readFile(full);
      let contentType = 'application/octet-stream';
      try {
        const meta = JSON.parse(await fs.readFile(`${full}.meta`, 'utf8')) as {
          contentType?: string;
        };
        if (meta.contentType) contentType = meta.contentType;
      } catch {
        // no meta — keep default
      }
      return { body, contentType };
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
  }

  async signedUrl(key: string) {
    // Local provider serves through the backend /api/storage/* route — keep relative.
    return `/api/storage/${encodeURIComponent(key)}`;
  }

  async delete(key: string) {
    const full = this.full(key);
    try {
      await fs.unlink(full);
      await fs.unlink(`${full}.meta`).catch(() => undefined);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }
}
