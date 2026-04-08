import { sql } from 'drizzle-orm';
import {
  boolean,
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
import { maintenanceItemKindEnum, maintenanceItemStatusEnum, mechanicAuthorityEnum } from './enums';
import { bases, schools } from './tenancy';
import { users } from './users';

/**
 * maintenance_item (MNT-01).
 *
 * Unified table for every CAMP item kind: inspections, ADs, oil changes,
 * 91.411/413, ELT, VOR, component lifing, MSBs, custom. The `kind` enum
 * decides how downstream queries interpret the row.
 *
 * Bridging FK columns (component_id, ad_compliance_id, last_work_order_id)
 * point at tables defined in sibling files; we declare them as bare uuid
 * columns here to avoid TypeScript circular imports. The SQL migration
 * defines the actual FK constraints.
 */
export const maintenanceItem = pgTable(
  'maintenance_item',
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
    componentId: uuid('component_id'),
    adComplianceId: uuid('ad_compliance_id'),
    kind: maintenanceItemKindEnum('kind').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    intervalRule: jsonb('interval_rule').notNull(),
    lastCompletedAt: timestamp('last_completed_at', { withTimezone: true }),
    lastCompletedHours: jsonb('last_completed_hours'),
    lastCompletedByUserId: uuid('last_completed_by_user_id').references(() => users.id),
    lastWorkOrderId: uuid('last_work_order_id'),
    nextDueAt: timestamp('next_due_at', { withTimezone: true }),
    nextDueHours: numeric('next_due_hours'),
    status: maintenanceItemStatusEnum('status').notNull().default('current'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').references(() => users.id),
    updatedBy: uuid('updated_by').references(() => users.id),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  () => [
    pgPolicy('maintenance_item_select_own_school_base', {
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
    pgPolicy('maintenance_item_modify_own_school_base', {
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

export const maintenanceItemTemplate = pgTable(
  'maintenance_item_template',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id').references(() => schools.id),
    name: text('name').notNull(),
    aircraftMake: text('aircraft_make'),
    aircraftModelPattern: text('aircraft_model_pattern'),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').references(() => users.id),
    updatedBy: uuid('updated_by').references(() => users.id),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  () => [
    pgPolicy('maintenance_item_template_select', {
      as: 'permissive',
      for: 'select',
      to: 'authenticated',
      using: sql`school_id is null or school_id = (auth.jwt() ->> 'school_id')::uuid`,
    }),
    pgPolicy('maintenance_item_template_modify', {
      as: 'permissive',
      for: 'all',
      to: 'authenticated',
      using: sql`school_id = (auth.jwt() ->> 'school_id')::uuid`,
      withCheck: sql`school_id = (auth.jwt() ->> 'school_id')::uuid`,
    }),
  ],
);

export const maintenanceItemTemplateLine = pgTable(
  'maintenance_item_template_line',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    templateId: uuid('template_id')
      .notNull()
      .references(() => maintenanceItemTemplate.id),
    kind: maintenanceItemKindEnum('kind').notNull(),
    title: text('title').notNull(),
    intervalRule: jsonb('interval_rule').notNull(),
    requiredAuthority: mechanicAuthorityEnum('required_authority'),
    defaultWarningDays: integer('default_warning_days'),
    position: integer('position').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  () => [
    pgPolicy('maintenance_item_template_line_select', {
      as: 'permissive',
      for: 'select',
      to: 'authenticated',
      using: sql`template_id in (select id from public.maintenance_item_template)`,
    }),
    pgPolicy('maintenance_item_template_line_modify', {
      as: 'permissive',
      for: 'all',
      to: 'authenticated',
      using: sql`template_id in (select id from public.maintenance_item_template)`,
      withCheck: sql`template_id in (select id from public.maintenance_item_template)`,
    }),
  ],
);

// Touch unused imports so eslint stays happy
void boolean;

export type MaintenanceItem = typeof maintenanceItem.$inferSelect;
export type NewMaintenanceItem = typeof maintenanceItem.$inferInsert;
export type MaintenanceItemTemplate = typeof maintenanceItemTemplate.$inferSelect;
export type MaintenanceItemTemplateLine = typeof maintenanceItemTemplateLine.$inferSelect;
