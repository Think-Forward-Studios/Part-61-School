import { sql } from 'drizzle-orm';
import {
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { qualificationKindEnum } from './enums';
import { bases, schools } from './tenancy';
import { users } from './users';

/**
 * instructor_qualification (IPF-02).
 *
 * Base-scoped: an instructor may be qualified to teach specific
 * aircraft types or courses only at specific bases. Phase 6 syllabus
 * rules will query this table.
 */
export const instructorQualification = pgTable(
  'instructor_qualification',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id),
    baseId: uuid('base_id')
      .notNull()
      .references(() => bases.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    kind: qualificationKindEnum('kind').notNull(),
    descriptor: text('descriptor').notNull(),
    grantedAt: timestamp('granted_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    grantedBy: uuid('granted_by').references(() => users.id),
    notes: text('notes'),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  () => [
    pgPolicy('instructor_qualification_select_own_school_base', {
      as: 'permissive',
      for: 'select',
      to: 'authenticated',
      using: sql`
        school_id = (auth.jwt() ->> 'school_id')::uuid
        and (
          (auth.jwt() ->> 'active_role') = 'admin'
          or base_id::text = current_setting('app.base_id', true)
          or current_setting('app.base_id', true) is null
        )
      `,
    }),
    pgPolicy('instructor_qualification_modify_own_school_base', {
      as: 'permissive',
      for: 'all',
      to: 'authenticated',
      using: sql`
        school_id = (auth.jwt() ->> 'school_id')::uuid
        and (
          (auth.jwt() ->> 'active_role') = 'admin'
          or base_id::text = current_setting('app.base_id', true)
          or current_setting('app.base_id', true) is null
        )
      `,
      withCheck: sql`
        school_id = (auth.jwt() ->> 'school_id')::uuid
        and (
          (auth.jwt() ->> 'active_role') = 'admin'
          or base_id::text = current_setting('app.base_id', true)
          or current_setting('app.base_id', true) is null
        )
      `,
    }),
  ],
);

export type InstructorQualification =
  typeof instructorQualification.$inferSelect;
export type NewInstructorQualification =
  typeof instructorQualification.$inferInsert;
