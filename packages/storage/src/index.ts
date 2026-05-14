import { ulid } from 'ulid';

export type StorageFileType = 'student-answer' | 'exam-paper' | 'pdf-report';

export interface StorageProvider {
  /** Persist bytes; returns the canonical key */
  put(input: {
    key: string;
    body: Buffer | Uint8Array;
    contentType: string;
  }): Promise<{ key: string; size: number }>;

  /** Retrieve bytes by canonical key */
  get(key: string): Promise<{ body: Buffer; contentType: string } | null>;

  /** Generate a (possibly time-limited) URL for retrieving the file */
  signedUrl(key: string, opts?: { expiresInSec?: number }): Promise<string>;

  /** Delete a file */
  delete(key: string): Promise<void>;
}

/**
 * Build the canonical storage key for an upload.
 * Format: `{organizationId}/{year}/{month}/{type}/{ulid}.{ext}` (§五.2)
 */
export function buildStorageKey(opts: {
  organizationId: string;
  type: StorageFileType;
  ext: string;
}): string {
  if (!opts.organizationId) throw new Error('organizationId required for storage key');
  const cleanExt = opts.ext.replace(/^\.+/, '').toLowerCase();
  const now = new Date();
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${opts.organizationId}/${year}/${month}/${opts.type}/${ulid()}.${cleanExt}`;
}

/**
 * Defence-in-depth: confirm a key belongs to `organizationId`. Per §三 (red lines),
 * cross-org reads MUST return 403.
 */
export function assertKeyBelongsToOrg(key: string, organizationId: string): void {
  if (!key.startsWith(`${organizationId}/`)) {
    const err = new Error('forbidden: key does not belong to organization');
    (err as Error & { code?: string }).code = 'storage_forbidden';
    throw err;
  }
}

export { LocalStorageProvider } from './local';
export { SupabaseStorageProvider } from './supabase';
export { createStorageProvider } from './factory';
