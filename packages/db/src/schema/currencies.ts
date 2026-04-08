import { sql } from 'drizzle-orm';
import {
  integer,
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
 * Instructor currencies (IPF-01).
 *
 * Status (current/due_soon/expired/unknown) is computed at read time via
 * the SQL function public.currency_status(expires_at, warning_days). No
 * stored status column. Per-kind warning_days live in currency_kind_config.
 */

export const instructorCurrency = pgTable(
  'instructor_currency',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    kind: currencyKindEnum('kind').notNull(),
    effectiveAt: timestamp('effective_at', { withTimezone: true }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    notes: text('notes'),
    documentId: uuid('document_id').references(() => documents.id),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  () => [
    pgPolicy('instructor_currency_select_own_school', {
      as: 'permissive',
      for: 'select',
      to: 'authenticated',
      using: sql`school_id = (auth.jwt() ->> 'school_id')::uuid`,
    }),
    pgPolicy('instructor_currency_modify_own_school', {
      as: 'permissive',
      for: 'all',
      to: 'authenticated',
      using: sql`school_id = (auth.jwt() ->> 'school_id')::uuid`,
      withCheck: sql`school_id = (auth.jwt() ->> 'school_id')::uuid`,
    }),
  ],
);

/**
 * currency_kind_config — per-kind warning_days. Seeded in migration.
 *
 * Not school-scoped (global per deployment), but we still enable RLS so
 * the reads are controlled. Single permissive SELECT policy for all
 * authenticated users.
 */
export const currencyKindConfig = pgTable(
  'currency_kind_config',
  {
    kind: currencyKindEnum('kind').primaryKey(),
    warningDays: integer('warning_days').notNull(),
  },
  () => [
    pgPolicy('currency_kind_config_select_all', {
      as: 'permissive',
      for: 'select',
      to: 'authenticated',
      using: sql`true`,
    }),
  ],
);

export type InstructorCurrency = typeof instructorCurrency.$inferSelect;
export type NewInstructorCurrency = typeof instructorCurrency.$inferInsert;
export type CurrencyKindConfig = typeof currencyKindConfig.$inferSelect;
