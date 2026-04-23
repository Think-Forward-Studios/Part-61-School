import { sql } from 'drizzle-orm';
import { doublePrecision, pgPolicy, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Tenancy: schools and bases.
 *
 * `schools` is the tenant root. RLS on schools matches the row's own id
 * against the JWT `school_id` claim. `bases` (and every other business
 * table) matches its `school_id` column against the same claim.
 *
 * Timezones (FND-06): all timestamps are timestamptz; schools store an
 * IANA timezone name; bases may override or inherit from the school.
 */

export const schools = pgTable(
  'schools',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    timezone: text('timezone').notNull(), // IANA name, e.g. 'America/Chicago'
    // Branding — set by admins on /admin/school.
    // icon_url holds a data URL (image/png|jpeg, base64). Migration
    // 0041 added it; keep the column small (~300 KB) by downscaling
    // client-side before encoding.
    iconUrl: text('icon_url'),
    // ICAO / display name of the airport the school operates from
    // (e.g. 'KBHM'). Shown in the top header pill in place of the
    // legacy base name.
    homeBaseAirport: text('home_base_airport'),
    // Resolved full airport name (migration 0042). Populated by the
    // admin form's OurAirports lookup so the header can render the
    // friendly name ('Birmingham-Shuttlesworth Intl') rather than
    // the ICAO.
    homeBaseAirportName: text('home_base_airport_name'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  () => [
    pgPolicy('schools_select_own', {
      as: 'permissive',
      for: 'select',
      to: 'authenticated',
      using: sql`id = (auth.jwt() ->> 'school_id')::uuid`,
    }),
    pgPolicy('schools_update_own', {
      as: 'permissive',
      for: 'update',
      to: 'authenticated',
      using: sql`id = (auth.jwt() ->> 'school_id')::uuid`,
      withCheck: sql`id = (auth.jwt() ->> 'school_id')::uuid`,
    }),
  ],
);

export const bases = pgTable(
  'bases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id),
    name: text('name').notNull(),
    timezone: text('timezone'), // nullable: falls back to schools.timezone
    latitude: doublePrecision('latitude'), // Phase 7: map center
    longitude: doublePrecision('longitude'), // Phase 7: map center
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  () => [
    pgPolicy('bases_select_own_school', {
      as: 'permissive',
      for: 'select',
      to: 'authenticated',
      using: sql`school_id = (auth.jwt() ->> 'school_id')::uuid`,
    }),
    pgPolicy('bases_insert_own_school', {
      as: 'permissive',
      for: 'insert',
      to: 'authenticated',
      withCheck: sql`school_id = (auth.jwt() ->> 'school_id')::uuid`,
    }),
    pgPolicy('bases_update_own_school', {
      as: 'permissive',
      for: 'update',
      to: 'authenticated',
      using: sql`school_id = (auth.jwt() ->> 'school_id')::uuid`,
      withCheck: sql`school_id = (auth.jwt() ->> 'school_id')::uuid`,
    }),
  ],
);

export type School = typeof schools.$inferSelect;
export type NewSchool = typeof schools.$inferInsert;
export type Base = typeof bases.$inferSelect;
export type NewBase = typeof bases.$inferInsert;
