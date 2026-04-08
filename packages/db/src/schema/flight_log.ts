import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  numeric,
  pgPolicy,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { aircraft, aircraftEngine } from './aircraft';
import { flightLogEntryKindEnum } from './enums';
import { bases, schools } from './tenancy';
import { users } from './users';

/**
 * Append-only flight log event store (FLT-01, FLT-02, FLT-03).
 *
 * Append-only contract is enforced three ways:
 *   1. No UPDATE policy → RLS denies updates
 *   2. Hard-delete blocker trigger attached via audit.attach()
 *   3. Corrections are NEW rows with kind='correction' and corrects_id
 *      pointing at the original
 *
 * Baseline rows (one per aircraft) carry the initial totals in
 * hobbs_in / tach_in with hobbs_out/tach_out NULL. The view
 * aircraft_current_totals handles the math.
 */
export const flightLogEntry = pgTable(
  'flight_log_entry',
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
    kind: flightLogEntryKindEnum('kind').notNull(),
    flownAt: timestamp('flown_at', { withTimezone: true }).notNull(),
    hobbsOut: numeric('hobbs_out', { precision: 10, scale: 1 }),
    hobbsIn: numeric('hobbs_in', { precision: 10, scale: 1 }),
    tachOut: numeric('tach_out', { precision: 10, scale: 1 }),
    tachIn: numeric('tach_in', { precision: 10, scale: 1 }),
    airframeDelta: numeric('airframe_delta', { precision: 10, scale: 1 })
      .notNull()
      .default('0'),
    correctsId: uuid('corrects_id').references(
      (): AnyPgColumn => flightLogEntry.id,
    ),
    // Phase 3 (FTR-03): pairs flight_out → flight_in for two-row
    // dispatch + close-out write paths. Null on baseline / correction /
    // legacy `flight` rows.
    pairedEntryId: uuid('paired_entry_id').references(
      (): AnyPgColumn => flightLogEntry.id,
    ),
    recordedBy: uuid('recorded_by')
      .notNull()
      .references(() => users.id),
    recordedAt: timestamp('recorded_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    notes: text('notes'),
  },
  () => [
    pgPolicy('flight_log_entry_select_own_school_base', {
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
    // INSERT-only modification surface: append-only contract means
    // we do NOT declare an UPDATE policy (so RLS denies updates) and
    // DELETE is blocked by the hard-delete trigger attached in the
    // migration via audit.attach().
    pgPolicy('flight_log_entry_insert_own_school_base', {
      as: 'permissive',
      for: 'insert',
      to: 'authenticated',
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

export const flightLogEntryEngine = pgTable(
  'flight_log_entry_engine',
  {
    flightLogEntryId: uuid('flight_log_entry_id')
      .notNull()
      .references(() => flightLogEntry.id),
    engineId: uuid('engine_id')
      .notNull()
      .references(() => aircraftEngine.id),
    deltaHours: numeric('delta_hours', { precision: 10, scale: 1 })
      .notNull()
      .default('0'),
  },
  (t) => [
    primaryKey({ columns: [t.flightLogEntryId, t.engineId] }),
    pgPolicy('flight_log_entry_engine_select_own_school', {
      as: 'permissive',
      for: 'select',
      to: 'authenticated',
      using: sql`flight_log_entry_id in (select id from public.flight_log_entry)`,
    }),
    pgPolicy('flight_log_entry_engine_insert_own_school', {
      as: 'permissive',
      for: 'insert',
      to: 'authenticated',
      withCheck: sql`flight_log_entry_id in (select id from public.flight_log_entry)`,
    }),
  ],
);

export type FlightLogEntry = typeof flightLogEntry.$inferSelect;
export type NewFlightLogEntry = typeof flightLogEntry.$inferInsert;
export type FlightLogEntryEngine = typeof flightLogEntryEngine.$inferSelect;
export type NewFlightLogEntryEngine = typeof flightLogEntryEngine.$inferInsert;
