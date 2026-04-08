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
import { aircraft } from './aircraft';
import { adComplianceStatusEnum } from './enums';
import { bases, schools } from './tenancy';
import { users } from './users';

/**
 * Airworthiness Directives (MNT-07).
 *
 * - airworthinessDirective: catalog row. school_id null = global.
 * - aircraftAdCompliance: per-aircraft applicability + status.
 * - adComplianceHistory: append-only event log; RLS forbids UPDATE/DELETE.
 */
export const airworthinessDirective = pgTable(
  'airworthiness_directive',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id').references(() => schools.id),
    adNumber: text('ad_number').notNull(),
    title: text('title').notNull(),
    summary: text('summary'),
    effectiveDate: date('effective_date'),
    complianceMethod: text('compliance_method'),
    applicability: jsonb('applicability'),
    supersededByAdId: uuid('superseded_by_ad_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').references(() => users.id),
    updatedBy: uuid('updated_by').references(() => users.id),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  () => [
    pgPolicy('airworthiness_directive_select', {
      as: 'permissive',
      for: 'select',
      to: 'authenticated',
      using: sql`school_id is null or school_id = (auth.jwt() ->> 'school_id')::uuid`,
    }),
    pgPolicy('airworthiness_directive_modify', {
      as: 'permissive',
      for: 'all',
      to: 'authenticated',
      using: sql`school_id = (auth.jwt() ->> 'school_id')::uuid`,
      withCheck: sql`school_id = (auth.jwt() ->> 'school_id')::uuid`,
    }),
  ],
);

export const aircraftAdCompliance = pgTable(
  'aircraft_ad_compliance',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id),
    baseId: uuid('base_id').references(() => bases.id),
    aircraftId: uuid('aircraft_id')
      .notNull()
      .references(() => aircraft.id),
    adId: uuid('ad_id')
      .notNull()
      .references(() => airworthinessDirective.id),
    applicable: boolean('applicable').notNull().default(true),
    firstDueAt: timestamp('first_due_at', { withTimezone: true }),
    firstDueHours: numeric('first_due_hours'),
    recurrenceRule: jsonb('recurrence_rule'),
    status: adComplianceStatusEnum('status').notNull().default('current'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').references(() => users.id),
    updatedBy: uuid('updated_by').references(() => users.id),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  () => [
    pgPolicy('aircraft_ad_compliance_select_own_school_base', {
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
    pgPolicy('aircraft_ad_compliance_modify_own_school_base', {
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

export const adComplianceHistory = pgTable(
  'ad_compliance_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    complianceRecordId: uuid('compliance_record_id')
      .notNull()
      .references(() => aircraftAdCompliance.id),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id),
    compliedAt: timestamp('complied_at', { withTimezone: true }).notNull().defaultNow(),
    compliedAtHours: jsonb('complied_at_hours'),
    methodUsed: text('method_used'),
    workOrderId: uuid('work_order_id'),
    signerSnapshot: jsonb('signer_snapshot').notNull(),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  () => [
    pgPolicy('ad_compliance_history_select', {
      as: 'permissive',
      for: 'select',
      to: 'authenticated',
      using: sql`school_id = (auth.jwt() ->> 'school_id')::uuid`,
    }),
    pgPolicy('ad_compliance_history_insert', {
      as: 'permissive',
      for: 'insert',
      to: 'authenticated',
      withCheck: sql`school_id = (auth.jwt() ->> 'school_id')::uuid`,
    }),
    pgPolicy('ad_compliance_history_no_update', {
      as: 'permissive',
      for: 'update',
      to: 'authenticated',
      using: sql`false`,
    }),
    pgPolicy('ad_compliance_history_no_delete', {
      as: 'permissive',
      for: 'delete',
      to: 'authenticated',
      using: sql`false`,
    }),
  ],
);

export type AirworthinessDirective = typeof airworthinessDirective.$inferSelect;
export type AircraftAdCompliance = typeof aircraftAdCompliance.$inferSelect;
export type AdComplianceHistory = typeof adComplianceHistory.$inferSelect;
