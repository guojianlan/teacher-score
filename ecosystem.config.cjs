// PM2 three-process layout per checklist §五.15.
// teacher-score-web  -> Next.js
// teacher-score-api  -> Hono HTTP
// teacher-score-worker -> Hono worker (pg-boss)

module.exports = {
  apps: [
    {
      name: 'teacher-score-web',
      cwd: './apps/web',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3000',
      env: { NODE_ENV: 'production' },
      max_memory_restart: '768M',
    },
    {
      name: 'teacher-score-api',
      cwd: './apps/backend',
      script: 'dist/http.js',
      env: { NODE_ENV: 'production', BACKEND_PORT: '3001' },
      max_memory_restart: '512M',
    },
    {
      name: 'teacher-score-worker',
      cwd: './apps/backend',
      script: 'dist/worker.js',
      env: { NODE_ENV: 'production', WORKER_TEAM_SIZE: '2' },
      max_memory_restart: '768M',
    },
  ],
};
