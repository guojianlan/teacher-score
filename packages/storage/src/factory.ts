import path from 'node:path';
import { LocalStorageProvider } from './local';
import { SupabaseStorageProvider } from './supabase';
import type { StorageProvider } from './index';

export function createStorageProvider(): StorageProvider {
  const driver = process.env.STORAGE_DRIVER ?? 'local';

  if (driver === 'supabase') {
    const url = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const bucket = process.env.SUPABASE_STORAGE_BUCKET ?? 'teacher-score-uploads';
    if (!url || !serviceRoleKey) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required when STORAGE_DRIVER=supabase');
    }
    return new SupabaseStorageProvider({ url, serviceRoleKey, bucket });
  }

  const root = process.env.STORAGE_LOCAL_ROOT ?? path.join(process.cwd(), 'uploads');
  return new LocalStorageProvider(root);
}
