/**
 * Phase 8: MSG-03 active session tracking.
 *
 * Supabase `auth.sessions` is not exposed via the public API so we
 * maintain our own last-seen-at table. Upserted by the Next.js
 * middleware at most once per 60s per user (see
 * apps/web/lib/supabase/middleware.ts).
 *
 * Admin active-session panel reads: `WHERE last_seen_at > now() - interval '5 minutes'`.
 */
import { sql } from 'drizzle-orm';
import { pgPolicy, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { bases, schools } from './tenancy';
import { users } from './users';

export const userSessionActivity = pgTable(
  'user_session_activity',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenIp: text('last_seen_ip'),
    lastSeenUserAgent: text('last_seen_user_agent'),
    activeRole: text('active_role'),
    activeBaseId: uuid('active_base_id').references(() => bases.id),
  },
  () => [
    // Admins + anyone in the school can read (MSG-03 admin panel lists
    // active sessions). Non-admin UI should not surface this data, but
    // RLS matches by school so cross-tenant leakage is impossible.
    pgPolicy('user_session_activity_select_own_school', {
      as: 'permissive',
      for: 'select',
      to: 'authenticated',
      using: sql`school_id = (auth.jwt() ->> 'school_id')::uuid`,
    }),
    pgPolicy('user_session_activity_upsert_self', {
      as: 'permissive',
      for: 'all',
      to: 'authenticated',
      using: sql`user_id = auth.uid()`,
      withCheck: sql`user_id = auth.uid()`,
    }),
  ],
);

export type UserSessionActivity = typeof userSessionActivity.$inferSelect;
export type NewUserSessionActivity = typeof userSessionActivity.$inferInsert;
