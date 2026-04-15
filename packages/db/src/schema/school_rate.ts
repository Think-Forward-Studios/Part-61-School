/**
 * Phase 8: School rate table (REP-03, REP-04).
 *
 * Admin-configurable per-hour rates for billable time. Effective-from/
 * until windows let admins schedule rate changes without breaking
 * historical cost calculations.
 *
 * Safety-relevant (users trust the billing numbers) — soft-delete only,
 * audit trigger attached.
 */
import { sql } from 'drizzle-orm';
import { integer, pgEnum, pgPolicy, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { schools } from './tenancy';
import { users } from './users';

export const rateKindEnum = pgEnum('rate_kind', [
  'aircraft_wet',
  'aircraft_dry',
  'instructor',
  'ground_instructor',
  'simulator',
  'surcharge_fixed',
]);

export const schoolRate = pgTable(
  'school_rate',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id),
    kind: rateKindEnum('kind').notNull(),
    // Optional scoping — null means default for this kind in the school
    aircraftId: uuid('aircraft_id'),
    aircraftMakeModel: text('aircraft_make_model'),
    instructorId: uuid('instructor_id'),
    amountCents: integer('amount_cents').notNull(),
    currencyCode: text('currency_code').notNull().default('USD'),
    effectiveFrom: timestamp('effective_from', { withTimezone: true }).notNull().defaultNow(),
    effectiveUntil: timestamp('effective_until', { withTimezone: true }),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').references(() => users.id),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    updatedBy: uuid('updated_by').references(() => users.id),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  () => [
    pgPolicy('school_rate_select_own_school', {
      as: 'permissive',
      for: 'select',
      to: 'authenticated',
      using: sql`school_id = (auth.jwt() ->> 'school_id')::uuid`,
    }),
    pgPolicy('school_rate_admin_write', {
      as: 'permissive',
      for: 'all',
      to: 'authenticated',
      using: sql`school_id = (auth.jwt() ->> 'school_id')::uuid
                 and (auth.jwt() ->> 'active_role') = 'admin'`,
      withCheck: sql`school_id = (auth.jwt() ->> 'school_id')::uuid
                     and (auth.jwt() ->> 'active_role') = 'admin'`,
    }),
  ],
);

export type SchoolRate = typeof schoolRate.$inferSelect;
export type NewSchoolRate = typeof schoolRate.$inferInsert;
