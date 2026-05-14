import { defineConfig } from 'drizzle-kit';

const url = process.env.DATABASE_URL;
if (!url) {
  // Keep CLI usable in CI/devcontainers where DATABASE_URL is provided just-in-time.
  // drizzle-kit will fail clearly if invoked without it set.
}

export default defineConfig({
  schema: './src/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: url ?? 'postgres://localhost/placeholder' },
  strict: true,
  verbose: true,
});
