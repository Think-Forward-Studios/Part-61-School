import { sql } from 'drizzle-orm';
import {
  bigserial,
  index,
  jsonb,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { auditActionEnum } from './enums';

/**
 * audit_log — append-only audit trail (FND-03).
 *
 * Rows are written ONLY by the audit.fn_log_change() trigger, which
 * runs SECURITY DEFINER and bypasses RLS. The INSERT policy below
 * intentionally has `with check (false)` so direct client INSERTs are
 * rejected. UPDATE and DELETE on this table are revoked from
 * authenticated/anon/public in the migration; even superuser DELETEs
 * are explicitly blocked at the role grant level.
 *
 * user_id is nullable per research Open Question 4: system-originated
 * mutations (seeds, background jobs) write rows with user_id = NULL
 * and actor_kind != 'user'.
 */
export const auditLog = pgTable(
  'audit_log',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    schoolId: uuid('school_id'),
    userId: uuid('user_id'),
    actorKind: text('actor_kind').notNull().default('user'),
    actorRole: text('actor_role'),
    tableName: text('table_name').notNull(),
    recordId: uuid('record_id').notNull(),
    action: auditActionEnum('action').notNull(),
    before: jsonb('before'),
    after: jsonb('after'),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('audit_log_table_record_idx').on(t.tableName, t.recordId),
    index('audit_log_user_at_idx').on(t.userId, t.at),
    index('audit_log_school_at_idx').on(t.schoolId, t.at),
    pgPolicy('audit_log_select_own_school', {
      as: 'permissive',
      for: 'select',
      to: sql`authenticated`,
      using: sql`school_id = (auth.jwt() ->> 'school_id')::uuid`,
    }),
    // Direct client INSERTs are rejected; only the trigger (SECURITY
    // DEFINER) can write rows. The migration also REVOKES update/delete
    // from public, authenticated, anon.
    pgPolicy('audit_log_insert_blocked', {
      as: 'permissive',
      for: 'insert',
      to: sql`authenticated`,
      withCheck: sql`false`,
    }),
  ],
);

export type AuditLogRow = typeof auditLog.$inferSelect;
