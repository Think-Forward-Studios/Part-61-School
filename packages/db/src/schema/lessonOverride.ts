import { sql } from 'drizzle-orm';
import {
  jsonb,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { lessonOverrideKindEnum } from './enums';
import { lessonGradeSheet } from './grading';
import { lesson } from './syllabus';
import { studentCourseEnrollment } from './enrollment';
import { bases, schools } from './tenancy';
import { users } from './users';

/**
 * lesson_override (SYL-17).
 *
 * Management override for out-of-order lesson scheduling/grading.
 * Mirrors Phase 4 maintenance_overrun pattern: justification + cert
 * snapshot + expiry + consumed_at single-use semantics.
 *
 * Partial unique index on (student_enrollment_id, lesson_id) WHERE
 * consumed_at IS NULL AND revoked_at IS NULL enforced in SQL migration.
 *
 * audit.attach() provides both audit trigger and hard-delete blocker.
 */
export const lessonOverride = pgTable(
  'lesson_override',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id),
    baseId: uuid('base_id').references(() => bases.id),
    studentEnrollmentId: uuid('student_enrollment_id')
      .notNull()
      .references(() => studentCourseEnrollment.id),
    lessonId: uuid('lesson_id')
      .notNull()
      .references(() => lesson.id),
    kind: lessonOverrideKindEnum('kind').notNull(),
    justification: text('justification').notNull(),
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
    grantedByUserId: uuid('granted_by_user_id')
      .notNull()
      .references(() => users.id),
    signerSnapshot: jsonb('signer_snapshot').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true })
      .notNull()
      .default(sql`now() + interval '30 days'`),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    consumedByGradeSheetId: uuid('consumed_by_grade_sheet_id').references(
      () => lessonGradeSheet.id,
    ),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedByUserId: uuid('revoked_by_user_id').references(() => users.id),
    revocationReason: text('revocation_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  () => [
    pgPolicy('lesson_override_select_own_school_base', {
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
    pgPolicy('lesson_override_modify_own_school_base', {
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

export type LessonOverride = typeof lessonOverride.$inferSelect;
export type NewLessonOverride = typeof lessonOverride.$inferInsert;
