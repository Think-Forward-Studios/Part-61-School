/**
 * Per-test seed helpers using direct DB access.
 */
import postgres from 'postgres';

const DB_URL =
  process.env.DIRECT_DATABASE_URL ??
  process.env.DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:54322/postgres';

let sql: ReturnType<typeof postgres> | null = null;

export function getDb() {
  if (!sql) {
    sql = postgres(DB_URL, { prepare: false, max: 2 });
  }
  return sql;
}

export async function cleanupDb() {
  if (sql) {
    await sql.end();
    sql = null;
  }
}
