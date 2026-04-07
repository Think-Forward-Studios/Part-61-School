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
 * Migrations use a separate DIRECT_DATABASE_URL (port 5432); see
 * drizzle.config.ts.
 */
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is required');
}

const client = postgres(connectionString, { prepare: false });

export const db = drizzle(client, { schema });
export type Db = typeof db;
export { schema };
