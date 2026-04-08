import { sql } from 'drizzle-orm';
import {
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { aircraft } from './aircraft';
import { schools } from './tenancy';
import { users } from './users';

/**
 * no_show (PER-07).
 *
 * Phase 3 scheduling writes rows here when a reservation lifecycle
 * transitions to the no_show close-out state. lesson_descriptor is a
 * free-text column now; Phase 5 replaces it with a FK to the syllabus
 * lesson table.
 */
export const noShow = pgTable(
  'no_show',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(),
    aircraftId: uuid('aircraft_id').references(() => aircraft.id),
    instructorId: uuid('instructor_id').references(() => users.id),
    lessonDescriptor: text('lesson_descriptor'),
    recordedBy: uuid('recorded_by')
      .notNull()
      .references(() => users.id),
    recordedAt: timestamp('recorded_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    reason: text('reason'),
  },
  () => [
    pgPolicy('no_show_select_own_school', {
      as: 'permissive',
      for: 'select',
      to: 'authenticated',
      using: sql`school_id = (auth.jwt() ->> 'school_id')::uuid`,
    }),
    pgPolicy('no_show_modify_own_school', {
      as: 'permissive',
      for: 'all',
      to: 'authenticated',
      using: sql`school_id = (auth.jwt() ->> 'school_id')::uuid`,
      withCheck: sql`school_id = (auth.jwt() ->> 'school_id')::uuid`,
    }),
  ],
);

export type NoShow = typeof noShow.$inferSelect;
export type NewNoShow = typeof noShow.$inferInsert;
