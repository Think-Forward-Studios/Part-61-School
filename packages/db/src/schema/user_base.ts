import { sql } from 'drizzle-orm';
import {
  pgPolicy,
  pgTable,
  primaryKey,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { bases, schools } from './tenancy';
import { users } from './users';

/**
 * user_base (MUL-01).
 *
 * Join table: a user can operate at multiple bases. RLS is school-scoped
 * only — we don't filter by active base here because the join itself is
 * the source of truth for which bases a user can switch to.
 */
export const userBase = pgTable(
  'user_base',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    baseId: uuid('base_id')
      .notNull()
      .references(() => bases.id),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.baseId] }),
    pgPolicy('user_base_select_own_school', {
      as: 'permissive',
      for: 'select',
      to: 'authenticated',
      using: sql`school_id = (auth.jwt() ->> 'school_id')::uuid`,
    }),
    pgPolicy('user_base_modify_own_school', {
      as: 'permissive',
      for: 'all',
      to: 'authenticated',
      using: sql`school_id = (auth.jwt() ->> 'school_id')::uuid`,
      withCheck: sql`school_id = (auth.jwt() ->> 'school_id')::uuid`,
    }),
  ],
);

export type UserBase = typeof userBase.$inferSelect;
export type NewUserBase = typeof userBase.$inferInsert;
