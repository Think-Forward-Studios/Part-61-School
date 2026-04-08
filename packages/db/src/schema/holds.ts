import { sql } from 'drizzle-orm';
import {
  index,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { holdKindEnum } from './enums';
import { schools } from './tenancy';
import { users } from './users';

/**
 * person_hold (PER-05, PER-06).
 *
 * Single table covers student holds, student groundings, and instructor
 * groundings — `kind` disambiguates. Active row is one where
 * `cleared_at IS NULL`. Holds are never deleted; clear via UPDATE.
 *
 * Audit trigger + hard-delete blocker attached in the migration.
 */
export const personHold = pgTable(
  'person_hold',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    kind: holdKindEnum('kind').notNull(),
    reason: text('reason').notNull(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    clearedAt: timestamp('cleared_at', { withTimezone: true }),
    clearedBy: uuid('cleared_by').references(() => users.id),
    clearedReason: text('cleared_reason'),
  },
  (t) => [
    index('person_hold_user_active_idx')
      .on(t.userId)
      .where(sql`cleared_at is null`),
    pgPolicy('person_hold_select_own_school', {
      as: 'permissive',
      for: 'select',
      to: 'authenticated',
      using: sql`school_id = (auth.jwt() ->> 'school_id')::uuid`,
    }),
    pgPolicy('person_hold_modify_own_school', {
      as: 'permissive',
      for: 'all',
      to: 'authenticated',
      using: sql`school_id = (auth.jwt() ->> 'school_id')::uuid`,
      withCheck: sql`school_id = (auth.jwt() ->> 'school_id')::uuid`,
    }),
  ],
);

export type PersonHold = typeof personHold.$inferSelect;
export type NewPersonHold = typeof personHold.$inferInsert;
