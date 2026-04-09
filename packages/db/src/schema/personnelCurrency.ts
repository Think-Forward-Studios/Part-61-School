import { sql } from 'drizzle-orm';
import {
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { documents } from './documents';
import { currencyKindEnum } from './enums';
import { schools } from './tenancy';
import { users } from './users';

/**
 * personnel_currency (Phase 5 SYL-12 rename of Phase 2 instructor_currency).
 *
 * Single table for both instructor and student currencies, discriminated by
 * subject_kind. The Phase 2 Drizzle export `instructorCurrency` (see
 * ./currencies.ts) remains as a backwards-compat alias that talks to the
 * `public.instructor_currency` VIEW created in migration 0014. New code
 * should import `personnelCurrency` from this module directly.
 */
export const personnelCurrency = pgTable(
  'personnel_currency',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id').notNull().references(() => schools.id),
    userId: uuid('user_id').notNull().references(() => users.id),
    subjectKind: text('subject_kind').notNull().default('instructor'),
    kind: currencyKindEnum('kind').notNull(),
    effectiveAt: timestamp('effective_at', { withTimezone: true }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    notes: text('notes'),
    documentId: uuid('document_id').references(() => documents.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  () => [
    pgPolicy('personnel_currency_select_own_school', {
      as: 'permissive',
      for: 'select',
      to: 'authenticated',
      using: sql`school_id = (auth.jwt() ->> 'school_id')::uuid`,
    }),
    pgPolicy('personnel_currency_modify_own_school', {
      as: 'permissive',
      for: 'all',
      to: 'authenticated',
      using: sql`school_id = (auth.jwt() ->> 'school_id')::uuid`,
      withCheck: sql`school_id = (auth.jwt() ->> 'school_id')::uuid`,
    }),
  ],
);

export type PersonnelCurrency = typeof personnelCurrency.$inferSelect;
export type NewPersonnelCurrency = typeof personnelCurrency.$inferInsert;
