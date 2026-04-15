import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    // Unit tests mock tx but the tRPC `withTenantTx` middleware still
    // tries to open a real transaction because it's composed into
    // every protectedProcedure. Point at the local Supabase Postgres
    // so the middleware can BEGIN/COMMIT cleanly and the procedure
    // body sees our mocked tx via ctx.tx.
    env: {
      DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
      DIRECT_DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
    },
    fileParallelism: false,
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: true },
    },
  },
});
