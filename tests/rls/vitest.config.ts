import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // RLS tests share a single Postgres instance — run serially to
    // avoid TRUNCATE races between files.
    fileParallelism: false,
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: true },
    },
  },
});
