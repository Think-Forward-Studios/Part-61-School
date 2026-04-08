import { sql } from 'drizzle-orm';
import {
  customType,
  integer,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { aircraft } from './aircraft';
import {
  closeOutReasonEnum,
  reservationActivityTypeEnum,
  reservationStatusEnum,
} from './enums';
import { bases, schools } from './tenancy';
import { users } from './users';

/**
 * Reservation table (SCH-01, SCH-02, SCH-13).
 *
 * Single table for every activity type (flight | simulator | oral |
 * academic | misc). Conflict prevention lives in the migration as four
 * partial `EXCLUDE USING gist` constraints — Drizzle has no DSL for
 * those, so they are NOT expressed here. See
 * 0007_phase3_scheduling_dispatch.sql for the constraint definitions.
 *
 * `time_range` is `tstzrange` with half-open `[)` bounds. The customType
 * below is a string passthrough — Drizzle reads/writes it as the raw
 * Postgres range literal (e.g. `[2026-05-01 14:00+00,2026-05-01 16:00+00)`).
 */

export const tstzrange = customType<{ data: string; driverData: string }>({
  dataType() {
    return 'tstzrange';
  },
});

export const reservation = pgTable(
  'reservation',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id),
    baseId: uuid('base_id')
      .notNull()
      .references(() => bases.id),
    activityType: reservationActivityTypeEnum('activity_type').notNull(),
    timeRange: tstzrange('time_range').notNull(),
    status: reservationStatusEnum('status').notNull().default('requested'),
    aircraftId: uuid('aircraft_id').references(() => aircraft.id),
    instructorId: uuid('instructor_id').references(() => users.id),
    studentId: uuid('student_id').references(() => users.id),
    roomId: uuid('room_id'),
    seriesId: uuid('series_id'),
    parentBlockId: uuid('parent_block_id'),
    notes: text('notes'),
    requestedAt: timestamp('requested_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    requestedBy: uuid('requested_by').references(() => users.id),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    approvedBy: uuid('approved_by').references(() => users.id),
    dispatchedAt: timestamp('dispatched_at', { withTimezone: true }),
    dispatchedBy: uuid('dispatched_by').references(() => users.id),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    closedBy: uuid('closed_by').references(() => users.id),
    closeOutReason: closeOutReasonEnum('close_out_reason'),
    studentCheckedInAt: timestamp('student_checked_in_at', {
      withTimezone: true,
    }),
    studentCheckedInBy: uuid('student_checked_in_by').references(
      () => users.id,
    ),
    instructorAuthorizedAt: timestamp('instructor_authorized_at', {
      withTimezone: true,
    }),
    instructorAuthorizedBy: uuid('instructor_authorized_by').references(
      () => users.id,
    ),
    routeString: text('route_string'),
    eteMinutes: integer('ete_minutes'),
    stops: text('stops').array(),
    fuelStops: text('fuel_stops').array(),
    alternate: text('alternate'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  () => [
    pgPolicy('reservation_select_own_school_base', {
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
    pgPolicy('reservation_modify_own_school_base', {
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

export type Reservation = typeof reservation.$inferSelect;
export type NewReservation = typeof reservation.$inferInsert;
