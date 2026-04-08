import { sql } from 'drizzle-orm';
import {
  integer,
  jsonb,
  numeric,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { aircraft } from './aircraft';
import { maintenanceItem } from './maintenance_item';
import { mechanicAuthorityEnum, workOrderKindEnum, workOrderStatusEnum } from './enums';
import { aircraftSquawk } from './squawks';
import { bases, schools } from './tenancy';
import { users } from './users';

/**
 * work_order (MNT-09).
 *
 * Closing a work order writes a logbook entry per applicable book
 * (airframe / engine / prop), updates the source maintenance_item or
 * aircraft_ad_compliance, and clears any matching grounding squawks.
 * That ceremony lives in plan 04-02 + 04-03; this file just defines
 * the data shape.
 */
export const workOrder = pgTable(
  'work_order',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id),
    baseId: uuid('base_id').references(() => bases.id),
    aircraftId: uuid('aircraft_id')
      .notNull()
      .references(() => aircraft.id),
    status: workOrderStatusEnum('status').notNull().default('draft'),
    kind: workOrderKindEnum('kind').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    assignedToUserId: uuid('assigned_to_user_id').references(() => users.id),
    sourceSquawkId: uuid('source_squawk_id').references(() => aircraftSquawk.id),
    sourceMaintenanceItemId: uuid('source_maintenance_item_id').references(
      () => maintenanceItem.id,
    ),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    signedOffAt: timestamp('signed_off_at', { withTimezone: true }),
    signedOffBy: uuid('signed_off_by').references(() => users.id),
    signerSnapshot: jsonb('signer_snapshot'),
    returnToServiceTime: jsonb('return_to_service_time'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').references(() => users.id),
    updatedBy: uuid('updated_by').references(() => users.id),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  () => [
    pgPolicy('work_order_select_own_school_base', {
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
    pgPolicy('work_order_modify_own_school_base', {
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

export const workOrderTask = pgTable(
  'work_order_task',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workOrderId: uuid('work_order_id')
      .notNull()
      .references(() => workOrder.id),
    position: integer('position').notNull().default(0),
    description: text('description').notNull(),
    requiredAuthority: mechanicAuthorityEnum('required_authority').notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    completedByUserId: uuid('completed_by_user_id').references(() => users.id),
    completionSignerSnapshot: jsonb('completion_signer_snapshot'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').references(() => users.id),
    updatedBy: uuid('updated_by').references(() => users.id),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  () => [
    pgPolicy('work_order_task_select', {
      as: 'permissive',
      for: 'select',
      to: 'authenticated',
      using: sql`work_order_id in (select id from public.work_order)`,
    }),
    pgPolicy('work_order_task_modify', {
      as: 'permissive',
      for: 'all',
      to: 'authenticated',
      using: sql`work_order_id in (select id from public.work_order)`,
      withCheck: sql`work_order_id in (select id from public.work_order)`,
    }),
  ],
);

export const workOrderPartConsumption = pgTable(
  'work_order_part_consumption',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workOrderId: uuid('work_order_id')
      .notNull()
      .references(() => workOrder.id),
    partId: uuid('part_id').notNull(),
    partLotId: uuid('part_lot_id'),
    quantity: numeric('quantity').notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }).notNull().defaultNow(),
    consumedBy: uuid('consumed_by').references(() => users.id),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  () => [
    pgPolicy('work_order_part_consumption_select', {
      as: 'permissive',
      for: 'select',
      to: 'authenticated',
      using: sql`work_order_id in (select id from public.work_order)`,
    }),
    pgPolicy('work_order_part_consumption_modify', {
      as: 'permissive',
      for: 'all',
      to: 'authenticated',
      using: sql`work_order_id in (select id from public.work_order)`,
      withCheck: sql`work_order_id in (select id from public.work_order)`,
    }),
  ],
);

export type WorkOrder = typeof workOrder.$inferSelect;
export type WorkOrderTask = typeof workOrderTask.$inferSelect;
export type WorkOrderPartConsumption = typeof workOrderPartConsumption.$inferSelect;
