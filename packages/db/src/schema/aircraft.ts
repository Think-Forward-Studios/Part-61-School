import { sql } from 'drizzle-orm';
import {
  integer,
  pgPolicy,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { aircraftEquipmentTagEnum, enginePositionEnum } from './enums';
import { bases, schools } from './tenancy';

/**
 * Fleet primitives (FLT-01, FLT-05, ADM-05).
 *
 * Aircraft are school-scoped AND base-scoped. The RLS policy enforces
 * school isolation hard and then either matches the active base GUC or
 * widens to admins within the same school.
 *
 * NO stored current_hobbs/current_tach/current_airframe columns —
 * totals are derived by the aircraft_current_totals view (FLT-03).
 */

export const aircraft = pgTable(
  'aircraft',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id),
    baseId: uuid('base_id')
      .notNull()
      .references(() => bases.id),
    tailNumber: text('tail_number').notNull(),
    make: text('make'),
    model: text('model'),
    year: integer('year'),
    equipmentNotes: text('equipment_notes'),
    // Migration 0045. Optional ICAO / display string for the airfield
    // this specific tail lives at. When null the UI falls back to
    // schools.home_base_airport (migration 0041). When set it overrides
    // for this tail — useful when one aircraft is parked somewhere
    // other than the school's main base.
    homeAirport: text('home_airport'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    // Phase 3 (FLT-04): admin-set ground flag consumed by
    // is_airworthy_at(). Null = not grounded.
    groundedAt: timestamp('grounded_at', { withTimezone: true }),
    // Phase 4 (MNT-03): explanation + back-pointer to the maintenance
    // item that caused the auto-ground. FK is declared in the SQL
    // migration to avoid a Drizzle import cycle.
    groundedReason: text('grounded_reason'),
    groundedByItemId: uuid('grounded_by_item_id'),
  },
  (t) => [
    uniqueIndex('aircraft_school_tail_unique').on(t.schoolId, t.tailNumber),
    pgPolicy('aircraft_select_own_school_base', {
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
    pgPolicy('aircraft_modify_own_school_base', {
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

export const aircraftEngine = pgTable(
  'aircraft_engine',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    aircraftId: uuid('aircraft_id')
      .notNull()
      .references(() => aircraft.id),
    position: enginePositionEnum('position').notNull(),
    serialNumber: text('serial_number'),
    installedAt: timestamp('installed_at', { withTimezone: true }),
    removedAt: timestamp('removed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  () => [
    // Engines inherit isolation via the aircraft join. We enforce with
    // an EXISTS subquery against aircraft so RLS on aircraft is the
    // single source of truth.
    pgPolicy('aircraft_engine_select_own_school', {
      as: 'permissive',
      for: 'select',
      to: 'authenticated',
      using: sql`aircraft_id in (select id from public.aircraft)`,
    }),
    pgPolicy('aircraft_engine_modify_own_school', {
      as: 'permissive',
      for: 'all',
      to: 'authenticated',
      using: sql`aircraft_id in (select id from public.aircraft)`,
      withCheck: sql`aircraft_id in (select id from public.aircraft)`,
    }),
  ],
);

export const aircraftEquipment = pgTable(
  'aircraft_equipment',
  {
    aircraftId: uuid('aircraft_id')
      .notNull()
      .references(() => aircraft.id),
    tag: aircraftEquipmentTagEnum('tag').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.aircraftId, t.tag] }),
    pgPolicy('aircraft_equipment_select_own_school', {
      as: 'permissive',
      for: 'select',
      to: 'authenticated',
      using: sql`aircraft_id in (select id from public.aircraft)`,
    }),
    pgPolicy('aircraft_equipment_modify_own_school', {
      as: 'permissive',
      for: 'all',
      to: 'authenticated',
      using: sql`aircraft_id in (select id from public.aircraft)`,
      withCheck: sql`aircraft_id in (select id from public.aircraft)`,
    }),
  ],
);

export type Aircraft = typeof aircraft.$inferSelect;
export type NewAircraft = typeof aircraft.$inferInsert;
export type AircraftEngine = typeof aircraftEngine.$inferSelect;
export type NewAircraftEngine = typeof aircraftEngine.$inferInsert;
export type AircraftEquipment = typeof aircraftEquipment.$inferSelect;
export type NewAircraftEquipment = typeof aircraftEquipment.$inferInsert;
