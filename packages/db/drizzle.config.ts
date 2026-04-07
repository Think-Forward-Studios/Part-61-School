import type { Config } from 'drizzle-kit';

/**
 * Drizzle Kit configuration.
 *
 * Uses DIRECT_DATABASE_URL (port 5432) for migrations because drizzle-kit
 * runs DDL statements that aren't safe through Supabase's transaction-mode
 * pooler (port 6543). Runtime queries from packages/db/src/client.ts use
 * DATABASE_URL (the pooled connection).
 *
 * See research §Pitfall 10 (env var split) and packages/db/src/client.ts.
 */
export default {
  schema: './src/schema/index.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL ?? '',
  },
  verbose: true,
  strict: true,
} satisfies Config;
