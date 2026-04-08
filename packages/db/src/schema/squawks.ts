import { sql } from 'drizzle-orm';
import { date, jsonb, pgPolicy, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { aircraft } from './aircraft';
import { squawkSeverityEnum, squawkStatusEnum } from './enums';
import { bases, schools } from './tenancy';
import { users } from './users';

/**
 * aircraft_squawk (FLT-04, SCH-04).
 *
 * Minimal Phase 3 version. `severity='grounding'` rows with no
 * `resolved_at` cause is_airworthy_at() to return false, blocking
 * dispatch. Phase 4 (CAMP) extends this table significantly.
 */
export const aircraftSquawk = pgTable(
  'aircraft_squawk',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id),
    baseId: uuid('base_id')
      .notNull()
      .references(() => bases.id),
    aircraftId: uuid('aircraft_id')
      .notNull()
      .references(() => aircraft.id),
    severity: squawkSeverityEnum('severity').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    openedAt: timestamp('opened_at', { withTimezone: true }).notNull().defaultNow(),
    openedBy: uuid('opened_by').references(() => users.id),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    resolvedBy: uuid('resolved_by').references(() => users.id),
    resolutionNotes: text('resolution_notes'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    // Phase 4 (MNT-04, MNT-05) lifecycle columns
    status: squawkStatusEnum('status').notNull().default('open'),
    triagedAt: timestamp('triaged_at', { withTimezone: true }),
    triagedBy: uuid('triaged_by').references(() => users.id),
    deferredUntil: date('deferred_until'),
    deferralJustification: text('deferral_justification'),
    workOrderId: uuid('work_order_id'),
    returnedToServiceAt: timestamp('returned_to_service_at', {
      withTimezone: true,
    }),
    returnedToServiceSignerSnapshot: jsonb('returned_to_service_signer_snapshot'),
  },
  () => [
    pgPolicy('aircraft_squawk_select_own_school_base', {
      as: 'permissive',
      for: 'select',
      to: 'authenticated',
      using: sql`
        school_id = (auth.jwt() ->> 'school_id')::uuid
        and (
          (auth.jwt() ->> 'active_role') = 'admin'
          or base_id::text = current_setting('app.base_id', true)
          or current_setting('app.base_id', true) is null
        )
      `,
    }),
    pgPolicy('aircraft_squawk_modify_own_school_base', {
      as: 'permissive',
      for: 'all',
      to: 'authenticated',
      using: sql`
        school_id = (auth.jwt() ->> 'school_id')::uuid
        and (
          (auth.jwt() ->> 'active_role') = 'admin'
          or base_id::text = current_setting('app.base_id', true)
          or current_setting('app.base_id', true) is null
        )
      `,
      withCheck: sql`
        school_id = (auth.jwt() ->> 'school_id')::uuid
        and (
          (auth.jwt() ->> 'active_role') = 'admin'
          or base_id::text = current_setting('app.base_id', true)
          or current_setting('app.base_id', true) is null
        )
      `,
    }),
  ],
);

export type AircraftSquawk = typeof aircraftSquawk.$inferSelect;
export type NewAircraftSquawk = typeof aircraftSquawk.$inferInsert;
