/**
 * Geofence schema (ADS-05).
 *
 * One active geofence per base (enforced by partial unique index in the
 * SQL migration). Supports polygon and circle kinds via a GeoJSON geometry
 * column. Circle kind stores additional radius_nm.
 *
 * RLS: all authenticated users in the school can SELECT; only admins can
 * INSERT/UPDATE/DELETE.
 */
import { sql } from 'drizzle-orm';
import { jsonb, numeric, pgPolicy, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { geofenceKindEnum } from './enums';
import { bases, schools } from './tenancy';
import { users } from './users';

export { geofenceKindEnum } from './enums';

export const geofence = pgTable(
  'geofence',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id),
    baseId: uuid('base_id')
      .notNull()
      .references(() => bases.id),
    kind: geofenceKindEnum('kind').notNull(),
    geometry: jsonb('geometry').notNull(),
    radiusNm: numeric('radius_nm'),
    label: text('label').notNull().default('Training Area'),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  () => [
    pgPolicy('geofence_select_own_school', {
      as: 'permissive',
      for: 'select',
      to: 'authenticated',
      using: sql`school_id = (auth.jwt() ->> 'school_id')::uuid`,
    }),
    pgPolicy('geofence_modify_admin_only', {
      as: 'permissive',
      for: 'all',
      to: 'authenticated',
      using: sql`
        school_id = (auth.jwt() ->> 'school_id')::uuid
        and (auth.jwt() ->> 'active_role') = 'admin'
      `,
      withCheck: sql`
        school_id = (auth.jwt() ->> 'school_id')::uuid
        and (auth.jwt() ->> 'active_role') = 'admin'
      `,
    }),
  ],
);

export type Geofence = typeof geofence.$inferSelect;
export type NewGeofence = typeof geofence.$inferInsert;
