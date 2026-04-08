import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  numeric,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  citizenshipStatusEnum,
  experienceSourceEnum,
  tsaAfspStatusEnum,
} from './enums';
import { schools } from './tenancy';
import { users } from './users';

/**
 * Personnel tables (PER-01/03/04/10).
 *
 * person_profile is 1:1 with users (user_id is the PK). emergency_contact,
 * info_release_authorization, and instructor_experience are 1:N.
 *
 * Every table is school-scoped via school_id + RLS. Audit triggers are
 * attached in the migration.
 */

export const personProfile = pgTable(
  'person_profile',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id),
    firstName: text('first_name'),
    lastName: text('last_name'),
    dateOfBirth: date('date_of_birth'),
    addressLine1: text('address_line1'),
    addressLine2: text('address_line2'),
    city: text('city'),
    state: text('state'),
    postalCode: text('postal_code'),
    country: text('country'),
    phone: text('phone'),
    emailAlt: text('email_alt'),
    faaAirmanCertNumber: text('faa_airman_cert_number'),
    citizenshipStatus: citizenshipStatusEnum('citizenship_status'),
    tsaAfspStatus: tsaAfspStatusEnum('tsa_afsp_status'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  () => [
    pgPolicy('person_profile_select_own_school', {
      as: 'permissive',
      for: 'select',
      to: 'authenticated',
      using: sql`school_id = (auth.jwt() ->> 'school_id')::uuid`,
    }),
    pgPolicy('person_profile_modify_own_school', {
      as: 'permissive',
      for: 'all',
      to: 'authenticated',
      using: sql`school_id = (auth.jwt() ->> 'school_id')::uuid`,
      withCheck: sql`school_id = (auth.jwt() ->> 'school_id')::uuid`,
    }),
  ],
);

export const emergencyContact = pgTable(
  'emergency_contact',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    name: text('name').notNull(),
    relationship: text('relationship'),
    phone: text('phone'),
    email: text('email'),
    isPrimary: boolean('is_primary').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  () => [
    pgPolicy('emergency_contact_select_own_school', {
      as: 'permissive',
      for: 'select',
      to: 'authenticated',
      using: sql`school_id = (auth.jwt() ->> 'school_id')::uuid`,
    }),
    pgPolicy('emergency_contact_modify_own_school', {
      as: 'permissive',
      for: 'all',
      to: 'authenticated',
      using: sql`school_id = (auth.jwt() ->> 'school_id')::uuid`,
      withCheck: sql`school_id = (auth.jwt() ->> 'school_id')::uuid`,
    }),
  ],
);

export const infoReleaseAuthorization = pgTable(
  'info_release_authorization',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    name: text('name').notNull(),
    relationship: text('relationship'),
    grantedAt: timestamp('granted_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    notes: text('notes'),
  },
  () => [
    pgPolicy('info_release_authorization_select_own_school', {
      as: 'permissive',
      for: 'select',
      to: 'authenticated',
      using: sql`school_id = (auth.jwt() ->> 'school_id')::uuid`,
    }),
    pgPolicy('info_release_authorization_modify_own_school', {
      as: 'permissive',
      for: 'all',
      to: 'authenticated',
      using: sql`school_id = (auth.jwt() ->> 'school_id')::uuid`,
      withCheck: sql`school_id = (auth.jwt() ->> 'school_id')::uuid`,
    }),
  ],
);

export const instructorExperience = pgTable(
  'instructor_experience',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    totalTime: numeric('total_time', { precision: 10, scale: 1 }),
    picTime: numeric('pic_time', { precision: 10, scale: 1 }),
    instructorTime: numeric('instructor_time', { precision: 10, scale: 1 }),
    multiEngineTime: numeric('multi_engine_time', { precision: 10, scale: 1 }),
    instrumentTime: numeric('instrument_time', { precision: 10, scale: 1 }),
    asOfDate: date('as_of_date').notNull(),
    source: experienceSourceEnum('source').notNull().default('self_reported'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  () => [
    pgPolicy('instructor_experience_select_own_school', {
      as: 'permissive',
      for: 'select',
      to: 'authenticated',
      using: sql`school_id = (auth.jwt() ->> 'school_id')::uuid`,
    }),
    pgPolicy('instructor_experience_modify_own_school', {
      as: 'permissive',
      for: 'all',
      to: 'authenticated',
      using: sql`school_id = (auth.jwt() ->> 'school_id')::uuid`,
      withCheck: sql`school_id = (auth.jwt() ->> 'school_id')::uuid`,
    }),
  ],
);

export type PersonProfile = typeof personProfile.$inferSelect;
export type NewPersonProfile = typeof personProfile.$inferInsert;
export type EmergencyContact = typeof emergencyContact.$inferSelect;
export type NewEmergencyContact = typeof emergencyContact.$inferInsert;
export type InfoReleaseAuthorization =
  typeof infoReleaseAuthorization.$inferSelect;
export type NewInfoReleaseAuthorization =
  typeof infoReleaseAuthorization.$inferInsert;
export type InstructorExperience = typeof instructorExperience.$inferSelect;
export type NewInstructorExperience = typeof instructorExperience.$inferInsert;
