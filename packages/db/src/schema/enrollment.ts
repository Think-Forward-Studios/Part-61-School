import { sql } from 'drizzle-orm';
import {
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { schools } from './tenancy';
import { users } from './users';

/**
 * student_course_enrollment (PER-09).
 *
 * Training history scaffold. Phase 5 replaces course_descriptor with
 * a real course_id FK once the syllabus model lands.
 */
export const studentCourseEnrollment = pgTable(
  'student_course_enrollment',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    courseDescriptor: text('course_descriptor').notNull(),
    enrolledAt: timestamp('enrolled_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    withdrawnAt: timestamp('withdrawn_at', { withTimezone: true }),
    notes: text('notes'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  () => [
    pgPolicy('student_course_enrollment_select_own_school', {
      as: 'permissive',
      for: 'select',
      to: 'authenticated',
      using: sql`school_id = (auth.jwt() ->> 'school_id')::uuid`,
    }),
    pgPolicy('student_course_enrollment_modify_own_school', {
      as: 'permissive',
      for: 'all',
      to: 'authenticated',
      using: sql`school_id = (auth.jwt() ->> 'school_id')::uuid`,
      withCheck: sql`school_id = (auth.jwt() ->> 'school_id')::uuid`,
    }),
  ],
);

export type StudentCourseEnrollment =
  typeof studentCourseEnrollment.$inferSelect;
export type NewStudentCourseEnrollment =
  typeof studentCourseEnrollment.$inferInsert;
