import { sql } from 'drizzle-orm';
import {
  boolean,
  jsonb,
  numeric,
  pgEnum,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { bases, schools } from './tenancy';
import { studentCourseEnrollment } from './enrollment';
import { users } from './users';

/**
 * Phase 5-03: test_grade (SYL-25).
 *
 * Records a test grade (knowledge / oral / end-of-stage / practical) against
 * any course component (course / stage / course_phase / unit / lesson / line_item).
 * Seal guard + hard-delete blocker live in migration 0022.
 */

export const testComponentKindEnum = pgEnum('test_component_kind', [
  'course',
  'stage',
  'course_phase',
  'unit',
  'lesson',
  'line_item',
]);

export const testKindEnum = pgEnum('test_kind', [
  'knowledge',
  'oral',
  'end_of_stage',
  'practical',
]);

export const testGrade = pgTable(
  'test_grade',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id').notNull().references(() => schools.id),
    baseId: uuid('base_id').references(() => bases.id),
    studentEnrollmentId: uuid('student_enrollment_id')
      .notNull()
      .references(() => studentCourseEnrollment.id),
    componentKind: testComponentKindEnum('component_kind').notNull(),
    componentId: uuid('component_id').notNull(),
    testKind: testKindEnum('test_kind').notNull(),
    score: numeric('score', { precision: 6, scale: 2 }),
    maxScore: numeric('max_score', { precision: 6, scale: 2 }),
    remarks: text('remarks'),
    signerSnapshot: jsonb('signer_snapshot'),
    sealed: boolean('sealed').notNull().default(false),
    sealedAt: timestamp('sealed_at', { withTimezone: true }),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
    recordedBy: uuid('recorded_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  () => [
    pgPolicy('test_grade_select', {
      as: 'permissive',
      for: 'select',
      to: 'authenticated',
      using: sql`school_id = (auth.jwt() ->> 'school_id')::uuid`,
    }),
    pgPolicy('test_grade_modify', {
      as: 'permissive',
      for: 'all',
      to: 'authenticated',
      using: sql`school_id = (auth.jwt() ->> 'school_id')::uuid`,
      withCheck: sql`school_id = (auth.jwt() ->> 'school_id')::uuid`,
    }),
  ],
);

export type TestGrade = typeof testGrade.$inferSelect;
export type NewTestGrade = typeof testGrade.$inferInsert;
