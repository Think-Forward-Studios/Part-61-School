import { sql } from 'drizzle-orm';
import { pgPolicy, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { unavailabilityKindEnum } from './enums';
import { tstzrange } from './reservations';
import { schools } from './tenancy';
import { users } from './users';

/**
 * person_unavailability (SCH-15).
 *
 * Captures blackout periods for instructors / students. A trigger
 * (defined in the migration) materializes a shadow `reservation` row
 * with activity_type='misc', status='approved' so the same exclusion
 * constraint that prevents double-booking also prevents booking against
 * unavailability.
 *
 * `shadow_reservation_id` lets the trigger find its shadow on UPDATE /
 * DELETE without a fragile lookup.
 */
export const personUnavailability = pgTable(
  'person_unavailability',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    timeRange: tstzrange('time_range').notNull(),
    kind: unavailabilityKindEnum('kind').notNull(),
    reason: text('reason'),
    shadowReservationId: uuid('shadow_reservation_id'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdBy: uuid('created_by').references(() => users.id),
  },
  () => [
    pgPolicy('person_unavailability_select_own_school', {
      as: 'permissive',
      for: 'select',
      to: 'authenticated',
      using: sql`school_id = (auth.jwt() ->> 'school_id')::uuid`,
    }),
    pgPolicy('person_unavailability_modify_own_school', {
      as: 'permissive',
      for: 'all',
      to: 'authenticated',
      using: sql`school_id = (auth.jwt() ->> 'school_id')::uuid`,
      withCheck: sql`school_id = (auth.jwt() ->> 'school_id')::uuid`,
    }),
  ],
);

export type PersonUnavailability = typeof personUnavailability.$inferSelect;
export type NewPersonUnavailability = typeof personUnavailability.$inferInsert;
