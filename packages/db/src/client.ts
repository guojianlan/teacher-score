import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL && process.env.NODE_ENV !== 'test') {
  // Don't throw at import time; let consumers fail loudly when they actually query.
  // Tests can provide an in-process URL.
  // eslint-disable-next-line no-console
  console.warn('[db] DATABASE_URL is not set');
}

// Reuse across hot reload in dev
declare global {
  // eslint-disable-next-line no-var
  var __teacher_score_pg: ReturnType<typeof postgres> | undefined;
}

const sql =
  globalThis.__teacher_score_pg ??
  postgres(DATABASE_URL ?? 'postgres://localhost/placeholder', {
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    idle_timeout: 20,
    prepare: false,
  });

if (process.env.NODE_ENV !== 'production') {
  globalThis.__teacher_score_pg = sql;
}

export const db = drizzle(sql, { schema });
export type Db = typeof db;
export { sql };
