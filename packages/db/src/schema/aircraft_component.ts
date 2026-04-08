import { sql } from 'drizzle-orm';
import {
  date,
  integer,
  jsonb,
  numeric,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { aircraft, aircraftEngine } from './aircraft';
import { aircraftComponentKindEnum } from './enums';
import { bases, schools } from './tenancy';
import { users } from './users';

/**
 * aircraft_component (MNT-06).
 *
 * Tracks individually-serialized parts installed on an aircraft or
 * engine: magnetos, props, vacuum pumps, ELTs, etc. Components with a
 * non-null `lifeLimitHours` get bridged into `maintenance_item` so the
 * unified due-date queries work without a code branch (Plan 04-02 adds
 * the bridging trigger).
 */
export const aircraftComponent = pgTable(
  'aircraft_component',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id),
    baseId: uuid('base_id').references(() => bases.id),
    aircraftId: uuid('aircraft_id')
      .notNull()
      .references(() => aircraft.id),
    engineId: uuid('engine_id').references(() => aircraftEngine.id),
    kind: aircraftComponentKindEnum('kind').notNull(),
    serialNumber: text('serial_number'),
    partNumber: text('part_number'),
    manufacturer: text('manufacturer'),
    installedAtHours: jsonb('installed_at_hours'),
    installedAtDate: date('installed_at_date'),
    lifeLimitHours: numeric('life_limit_hours'),
    lifeLimitMonths: integer('life_limit_months'),
    overhaulIntervalHours: numeric('overhaul_interval_hours'),
    lastOverhaulAtHours: jsonb('last_overhaul_at_hours'),
    removedAt: timestamp('removed_at', { withTimezone: true }),
    removedReason: text('removed_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').references(() => users.id),
    updatedBy: uuid('updated_by').references(() => users.id),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  () => [
    pgPolicy('aircraft_component_select_own_school_base', {
      as: 'permissive',
      for: 'select',
      to: 'authenticated',
      using: sql`
        school_id = (auth.jwt() ->> 'school_id')::uuid
        and (
          (auth.jwt() ->> 'active_role') = 'admin'
          or base_id::text = current_setting('app.base_id', true)
          or current_setting('app.base_id', true) is null
          or base_id is null
        )
      `,
    }),
    pgPolicy('aircraft_component_modify_own_school_base', {
      as: 'permissive',
      for: 'all',
      to: 'authenticated',
      using: sql`
        school_id = (auth.jwt() ->> 'school_id')::uuid
        and (
          (auth.jwt() ->> 'active_role') = 'admin'
          or base_id::text = current_setting('app.base_id', true)
          or current_setting('app.base_id', true) is null
          or base_id is null
        )
      `,
      withCheck: sql`
        school_id = (auth.jwt() ->> 'school_id')::uuid
        and (
          (auth.jwt() ->> 'active_role') = 'admin'
          or base_id::text = current_setting('app.base_id', true)
          or current_setting('app.base_id', true) is null
          or base_id is null
        )
      `,
    }),
  ],
);

export const aircraftComponentOverhaul = pgTable(
  'aircraft_component_overhaul',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    componentId: uuid('component_id')
      .notNull()
      .references(() => aircraftComponent.id),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id),
    overhauledAt: timestamp('overhauled_at', { withTimezone: true }).notNull().defaultNow(),
    overhauledAtHours: jsonb('overhauled_at_hours'),
    workOrderId: uuid('work_order_id'),
    signerSnapshot: jsonb('signer_snapshot').notNull(),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  () => [
    pgPolicy('aircraft_component_overhaul_select', {
      as: 'permissive',
      for: 'select',
      to: 'authenticated',
      using: sql`school_id = (auth.jwt() ->> 'school_id')::uuid`,
    }),
    pgPolicy('aircraft_component_overhaul_insert', {
      as: 'permissive',
      for: 'insert',
      to: 'authenticated',
      withCheck: sql`school_id = (auth.jwt() ->> 'school_id')::uuid`,
    }),
    pgPolicy('aircraft_component_overhaul_no_update', {
      as: 'permissive',
      for: 'update',
      to: 'authenticated',
      using: sql`false`,
    }),
    pgPolicy('aircraft_component_overhaul_no_delete', {
      as: 'permissive',
      for: 'delete',
      to: 'authenticated',
      using: sql`false`,
    }),
  ],
);

export type AircraftComponent = typeof aircraftComponent.$inferSelect;
export type AircraftComponentOverhaul = typeof aircraftComponentOverhaul.$inferSelect;
