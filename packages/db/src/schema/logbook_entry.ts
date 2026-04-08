import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  jsonb,
  numeric,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { aircraft, aircraftEngine } from './aircraft';
import { logbookBookKindEnum } from './enums';
import { maintenanceItem } from './maintenance_item';
import { bases, schools } from './tenancy';
import { users } from './users';
import { workOrder } from './work_order';

/**
 * logbook_entry (MNT-10).
 *
 * Three logical books per aircraft (airframe + per-engine + prop). Once
 * `sealed = true` the row is immutable, enforced by a BEFORE UPDATE
 * trigger in 0010_phase4_camp_tables.sql. Corrections are NEW entries
 * that reference the original via correctsEntryId.
 *
 * NO `deletedAt` column — logbook entries are retained forever per the
 * Phase 4 retention contract.
 */
export const logbookEntry = pgTable(
  'logbook_entry',
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
    bookKind: logbookBookKindEnum('book_kind').notNull(),
    entryDate: date('entry_date').notNull(),
    hobbs: numeric('hobbs'),
    tach: numeric('tach'),
    airframeTime: numeric('airframe_time'),
    engineTime: numeric('engine_time'),
    description: text('description').notNull(),
    workOrderId: uuid('work_order_id').references(() => workOrder.id),
    maintenanceItemId: uuid('maintenance_item_id').references(() => maintenanceItem.id),
    correctsEntryId: uuid('corrects_entry_id'),
    signerSnapshot: jsonb('signer_snapshot'),
    signedAt: timestamp('signed_at', { withTimezone: true }),
    sealed: boolean('sealed').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdByUserId: uuid('created_by_user_id').references(() => users.id),
  },
  () => [
    pgPolicy('logbook_entry_select_own_school_base', {
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
    pgPolicy('logbook_entry_modify_own_school_base', {
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

export type LogbookEntry = typeof logbookEntry.$inferSelect;
export type NewLogbookEntry = typeof logbookEntry.$inferInsert;
