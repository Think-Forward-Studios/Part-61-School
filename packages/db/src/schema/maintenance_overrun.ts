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
import { bases, schools } from './tenancy';
import { users } from './users';

/**
 * maintenance_overrun (FLT-04, MNT-03).
 *
 * §91.409(b) ten-hour overrun grant. Once-only per compliance cycle —
 * enforced via a partial unique index on (item_id) WHERE revoked_at IS
 * NULL AND deleted_at IS NULL in the SQL migration.
 */
export const maintenanceOverrun = pgTable(
  'maintenance_overrun',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id),
    baseId: uuid('base_id').references(() => bases.id),
    aircraftId: uuid('aircraft_id')
      .notNull()
      .references(() => aircraft.id),
    itemId: uuid('item_id')
      .notNull()
      .references(() => maintenanceItem.id),
    authorityCfrCite: text('authority_cfr_cite').notNull().default('§91.409(b)'),
    justification: text('justification').notNull(),
    maxAdditionalHours: integer('max_additional_hours').notNull(),
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
    grantedByUserId: uuid('granted_by_user_id').references(() => users.id),
    signerSnapshot: jsonb('signer_snapshot').notNull(),
    consumedHours: numeric('consumed_hours').notNull().default('0'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').references(() => users.id),
    updatedBy: uuid('updated_by').references(() => users.id),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  () => [
    pgPolicy('maintenance_overrun_select_own_school_base', {
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
    pgPolicy('maintenance_overrun_modify_own_school_base', {
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

export type MaintenanceOverrun = typeof maintenanceOverrun.$inferSelect;
