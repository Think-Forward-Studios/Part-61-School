import { sql } from 'drizzle-orm';
import {
  boolean,
  pgEnum,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uuid,
  jsonb,
} from 'drizzle-orm/pg-core';
import { bases, schools } from './tenancy';
import { users } from './users';

/**
 * Phase 5 endorsement schema (SYL-09).
 *
 * endorsement_template is a catalog: read-by-all authenticated, writes
 * restricted to the migration / seed path. student_endorsement captures
 * per-issuance rendered text + signer snapshot, with seal-on-sign trigger
 * (see migration 0018 fn_syllabus_seal_guard).
 */

export const endorsementCategoryEnum = pgEnum('endorsement_category', [
  'student_pilot',
  'solo',
  'xc',
  'aircraft_class_rating',
  'flight_review',
  'ipc',
  'practical_test',
  'knowledge_test',
  'other',
]);

export const endorsementTemplate = pgTable(
  'endorsement_template',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull(),
    title: text('title').notNull(),
    bodyTemplate: text('body_template').notNull(),
    category: endorsementCategoryEnum('category').notNull(),
    acReference: text('ac_reference'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  () => [
    pgPolicy('endorsement_template_select', {
      as: 'permissive',
      for: 'select',
      to: 'authenticated',
      using: sql`true`,
    }),
  ],
);

export const studentEndorsement = pgTable(
  'student_endorsement',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id').notNull().references(() => schools.id),
    baseId: uuid('base_id').references(() => bases.id),
    studentUserId: uuid('student_user_id').notNull().references(() => users.id),
    templateId: uuid('template_id').references(() => endorsementTemplate.id),
    renderedText: text('rendered_text').notNull(),
    issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
    issuedByUserId: uuid('issued_by_user_id').references(() => users.id),
    signerSnapshot: jsonb('signer_snapshot'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    aircraftContext: text('aircraft_context'),
    notes: text('notes'),
    sealed: boolean('sealed').notNull().default(false),
    sealedAt: timestamp('sealed_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').references(() => users.id),
    updatedBy: uuid('updated_by').references(() => users.id),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  () => [
    pgPolicy('student_endorsement_select', {
      as: 'permissive',
      for: 'select',
      to: 'authenticated',
      using: sql`school_id = (auth.jwt() ->> 'school_id')::uuid`,
    }),
    pgPolicy('student_endorsement_modify', {
      as: 'permissive',
      for: 'all',
      to: 'authenticated',
      using: sql`school_id = (auth.jwt() ->> 'school_id')::uuid`,
      withCheck: sql`school_id = (auth.jwt() ->> 'school_id')::uuid`,
    }),
  ],
);

export type EndorsementTemplate = typeof endorsementTemplate.$inferSelect;
export type NewEndorsementTemplate = typeof endorsementTemplate.$inferInsert;
export type StudentEndorsement = typeof studentEndorsement.$inferSelect;
export type NewStudentEndorsement = typeof studentEndorsement.$inferInsert;
