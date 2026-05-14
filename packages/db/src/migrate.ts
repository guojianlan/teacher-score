import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is required to run migrations');
  }
  const sql = postgres(url, { max: 1 });
  const db = drizzle(sql);
  const here = path.dirname(fileURLToPath(import.meta.url));
  const folder = path.resolve(here, '..', 'drizzle');
  // eslint-disable-next-line no-console
  console.log(`[db] migrating from ${folder}`);
  await migrate(db, { migrationsFolder: folder });
  await sql.end();
  // eslint-disable-next-line no-console
  console.log('[db] migrations applied');
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
