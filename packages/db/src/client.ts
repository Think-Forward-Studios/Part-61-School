import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

/**
 * Runtime Drizzle client.
 *
 * Connects via DATABASE_URL (Supabase transaction-mode pooler, port 6543).
 * `prepare: false` is REQUIRED in transaction mode — prepared statements
 * cannot survive being handed back to the pool between transactions.
 *
 * Serverless sizing (Vercel lambdas):
 *   max: 1               — one connection per lambda instance. Each
 *                          invocation is single-threaded; holding more
 *                          connections per instance multiplies pool usage
 *                          and triggers Supavisor's "MaxClientsInSessionMode"
 *                          / pool-exhausted errors under load.
 *   idle_timeout: 20     — release idle connections fast so Supavisor can
 *                          recycle them across instances.
 *   max_lifetime: 60*30  — hard cap at 30 min so a long-lived warm lambda
 *                          eventually rotates its connection.
 *   connect_timeout: 10  — fail fast if the pooler is saturated rather
 *                          than queueing behind other invocations.
 *
 * Migrations use a separate DIRECT_DATABASE_URL (port 5432); see
 * drizzle.config.ts.
 */
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is required');
}

// Dev-only sanity check: flag when DATABASE_URL doesn't look like the
// transaction-mode pooler. Supavisor session mode (port 5432) exhausts
// the pool almost immediately under Vercel serverless load. Print a
// loud warning so misconfiguration surfaces in logs.
if (process.env.NODE_ENV !== 'production' && !connectionString.includes(':6543')) {
  console.warn(
    '[@part61/db] DATABASE_URL does not contain ":6543" — Supabase ' +
      'transaction-mode pooler expected. Session-mode (5432) will throw ' +
      'MaxClientsInSessionMode under load.',
  );
}

const client = postgres(connectionString, {
  prepare: false,
  max: 1,
  idle_timeout: 20,
  max_lifetime: 60 * 30,
  connect_timeout: 10,
});

export const db = drizzle(client, { schema });
export type Db = typeof db;
export { schema };
