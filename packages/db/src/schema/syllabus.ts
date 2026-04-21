import { sql } from 'drizzle-orm';
import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { schools } from './tenancy';
import { users } from './users';

/**
 * Phase 5 syllabus tree: course → course_version → stage → course_phase
 * → unit → lesson → line_item.
 *
 * See packages/db/migrations/0016_phase5_course_tree.sql for the full
 * table definitions, indexes, RLS policies, and CHECK constraints. This
 * module is the Drizzle mirror — tables must stay in sync with the SQL.
 *
 * Exclusive-FK constraints on `unit` and `lesson` are ENFORCED IN SQL
 * via `num_nonnulls(...) = 1` CHECK constraints. Drizzle has no DSL for
 * those, so they live ONLY in the migration.
 *
 * RLS: `school_id is null` = system template (read-only for all
 * authenticated); matching school_id = full read/write.
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------
export const lessonKindEnum = pgEnum('lesson_kind', [
  'ground',
  'flight',
  'simulator',
  'oral',
  'written_test',
]);

export const lineItemClassificationEnum = pgEnum('line_item_classification', [
  'required',
  'optional',
  'must_pass',
]);

export const gradingScaleEnum = pgEnum('grading_scale', [
  'absolute_ipm',
  'relative_5',
  'pass_fail',
]);

export const courseRatingSoughtEnum = pgEnum('course_rating_sought', [
  'private_pilot',
  'instrument_rating',
  'commercial_single_engine',
  'commercial_multi_engine',
  'cfi',
  'cfii',
  'mei',
  'custom',
  // Phase 2 syllabus sprint (migration 0039) — disambiguates the coarse
  // 'private_pilot' into per-category/class pathways and adds Sport +
  // Recreational Pilot. Legacy 'private_pilot' rows still work; new
  // ASEL courses SHOULD use 'private_pilot_asel'.
  'private_pilot_asel',
  'private_pilot_amel',
  'private_pilot_amel_addon',
  'private_pilot_rotorcraft_helicopter',
  'private_pilot_glider',
  'sport_pilot',
  'recreational_pilot',
]);

// ---------------------------------------------------------------------------
// Shared RLS policy factories (the null-school = template pattern)
// ---------------------------------------------------------------------------
const treeSelectPolicy = (name: string) =>
  pgPolicy(name, {
    as: 'permissive',
    for: 'select',
    to: 'authenticated',
    using: sql`school_id is null or school_id = (auth.jwt() ->> 'school_id')::uuid`,
  });
const treeModifyPolicy = (name: string) =>
  pgPolicy(name, {
    as: 'permissive',
    for: 'all',
    to: 'authenticated',
    using: sql`school_id = (auth.jwt() ->> 'school_id')::uuid`,
    withCheck: sql`school_id = (auth.jwt() ->> 'school_id')::uuid`,
  });

// ---------------------------------------------------------------------------
// course
// ---------------------------------------------------------------------------
export const course = pgTable(
  'course',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id').references(() => schools.id), // null = system template
    code: text('code').notNull(),
    title: text('title').notNull(),
    ratingSought: courseRatingSoughtEnum('rating_sought').notNull(),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').references(() => users.id),
    updatedBy: uuid('updated_by').references(() => users.id),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  () => [treeSelectPolicy('course_select'), treeModifyPolicy('course_modify')],
);

// ---------------------------------------------------------------------------
// course_version
// ---------------------------------------------------------------------------
export const courseVersion = pgTable(
  'course_version',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    courseId: uuid('course_id')
      .notNull()
      .references(() => course.id),
    schoolId: uuid('school_id').references(() => schools.id),
    versionLabel: text('version_label').notNull(),
    gradingScale: gradingScaleEnum('grading_scale').notNull().default('absolute_ipm'),
    minLevels: integer('min_levels').notNull().default(3),
    notes: text('notes'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    publishedBy: uuid('published_by').references(() => users.id),
    supersededAt: timestamp('superseded_at', { withTimezone: true }),
    // Phase 6 additions (SYL-21, SYL-22)
    minimumHours: jsonb('minimum_hours'),
    defaultPlanCadenceHoursPerWeek: numeric('default_plan_cadence_hours_per_week', {
      precision: 5,
      scale: 2,
    })
      .notNull()
      .default('4'),
    // Phase 2 syllabus sprint (migration 0039). Both optional / nullable.
    //   launchMethodPrimary — PPL-G pathway: 'aerotow' | 'ground_launch' |
    //     'self_launch'. CHECK constraint enforced at DB level.
    //   mosaicAligned — SP-A MOSAIC alignment flag (LSA definition update
    //     effective 2025-10-22 pilot / 2026-07-24 airworthiness).
    launchMethodPrimary: text('launch_method_primary'),
    mosaicAligned: boolean('mosaic_aligned'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').references(() => users.id),
    updatedBy: uuid('updated_by').references(() => users.id),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  () => [treeSelectPolicy('course_version_select'), treeModifyPolicy('course_version_modify')],
);

// ---------------------------------------------------------------------------
// stage
// ---------------------------------------------------------------------------
export const stage = pgTable(
  'stage',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id').references(() => schools.id),
    courseVersionId: uuid('course_version_id')
      .notNull()
      .references(() => courseVersion.id),
    position: integer('position').notNull(),
    code: text('code').notNull(),
    title: text('title').notNull(),
    objectives: text('objectives'),
    completionStandards: text('completion_standards'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').references(() => users.id),
    updatedBy: uuid('updated_by').references(() => users.id),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  () => [treeSelectPolicy('stage_select'), treeModifyPolicy('stage_modify')],
);

// ---------------------------------------------------------------------------
// course_phase
// ---------------------------------------------------------------------------
export const coursePhase = pgTable(
  'course_phase',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id').references(() => schools.id),
    courseVersionId: uuid('course_version_id')
      .notNull()
      .references(() => courseVersion.id),
    stageId: uuid('stage_id')
      .notNull()
      .references(() => stage.id),
    position: integer('position').notNull(),
    code: text('code').notNull(),
    title: text('title').notNull(),
    objectives: text('objectives'),
    completionStandards: text('completion_standards'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').references(() => users.id),
    updatedBy: uuid('updated_by').references(() => users.id),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  () => [treeSelectPolicy('course_phase_select'), treeModifyPolicy('course_phase_modify')],
);

// ---------------------------------------------------------------------------
// unit (exclusive-FK: stage_id XOR course_phase_id — enforced in SQL)
// ---------------------------------------------------------------------------
export const unit = pgTable(
  'unit',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id').references(() => schools.id),
    courseVersionId: uuid('course_version_id')
      .notNull()
      .references(() => courseVersion.id),
    stageId: uuid('stage_id').references(() => stage.id),
    coursePhaseId: uuid('course_phase_id').references(() => coursePhase.id),
    position: integer('position').notNull(),
    code: text('code').notNull(),
    title: text('title').notNull(),
    objectives: text('objectives'),
    completionStandards: text('completion_standards'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').references(() => users.id),
    updatedBy: uuid('updated_by').references(() => users.id),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  () => [treeSelectPolicy('unit_select'), treeModifyPolicy('unit_modify')],
);

// ---------------------------------------------------------------------------
// lesson (exclusive-FK: stage | course_phase | unit — enforced in SQL)
// ---------------------------------------------------------------------------
export const lesson = pgTable(
  'lesson',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id').references(() => schools.id),
    courseVersionId: uuid('course_version_id')
      .notNull()
      .references(() => courseVersion.id),
    stageId: uuid('stage_id').references(() => stage.id),
    coursePhaseId: uuid('course_phase_id').references(() => coursePhase.id),
    unitId: uuid('unit_id').references(() => unit.id),
    position: integer('position').notNull(),
    code: text('code').notNull(),
    title: text('title').notNull(),
    kind: lessonKindEnum('kind').notNull(),
    objectives: text('objectives'),
    completionStandards: text('completion_standards'),
    minHours: numeric('min_hours', { precision: 4, scale: 1 }),
    requiredResources: jsonb('required_resources')
      .notNull()
      .default(sql`'[]'::jsonb`),
    requiredCurrencies: jsonb('required_currencies')
      .notNull()
      .default(sql`'[]'::jsonb`),
    // Phase 6 additions (SYL-16, SYL-18, SYL-20, SCH-11)
    prerequisiteLessonIds: uuid('prerequisite_lesson_ids')
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    requiredInstructorQualifications: jsonb('required_instructor_qualifications')
      .notNull()
      .default(sql`'[]'::jsonb`),
    requiredInstructorCurrencies: jsonb('required_instructor_currencies')
      .notNull()
      .default(sql`'[]'::jsonb`),
    requiredStudentQualifications: jsonb('required_student_qualifications')
      .notNull()
      .default(sql`'[]'::jsonb`),
    requiredAircraftEquipment: jsonb('required_aircraft_equipment')
      .notNull()
      .default(sql`'[]'::jsonb`),
    requiredAircraftType: text('required_aircraft_type'),
    requiredSimKind: text('required_sim_kind'),
    maxRepeats: integer('max_repeats'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').references(() => users.id),
    updatedBy: uuid('updated_by').references(() => users.id),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  () => [treeSelectPolicy('lesson_select'), treeModifyPolicy('lesson_modify')],
);

// ---------------------------------------------------------------------------
// line_item
// ---------------------------------------------------------------------------
export const lineItem = pgTable(
  'line_item',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id').references(() => schools.id),
    courseVersionId: uuid('course_version_id')
      .notNull()
      .references(() => courseVersion.id),
    lessonId: uuid('lesson_id')
      .notNull()
      .references(() => lesson.id),
    position: integer('position').notNull(),
    code: text('code').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    objectives: text('objectives'),
    completionStandards: text('completion_standards'),
    classification: lineItemClassificationEnum('classification').notNull().default('required'),
    gradingScaleOverride: gradingScaleEnum('grading_scale_override'),
    // Phase 6 addition (SYL-20)
    maxRepeats: integer('max_repeats'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').references(() => users.id),
    updatedBy: uuid('updated_by').references(() => users.id),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  () => [treeSelectPolicy('line_item_select'), treeModifyPolicy('line_item_modify')],
);

export type Course = typeof course.$inferSelect;
export type NewCourse = typeof course.$inferInsert;
export type CourseVersion = typeof courseVersion.$inferSelect;
export type NewCourseVersion = typeof courseVersion.$inferInsert;
export type Stage = typeof stage.$inferSelect;
export type NewStage = typeof stage.$inferInsert;
export type CoursePhase = typeof coursePhase.$inferSelect;
export type NewCoursePhase = typeof coursePhase.$inferInsert;
export type Unit = typeof unit.$inferSelect;
export type NewUnit = typeof unit.$inferInsert;
export type Lesson = typeof lesson.$inferSelect;
export type NewLesson = typeof lesson.$inferInsert;
export type LineItem = typeof lineItem.$inferSelect;
export type NewLineItem = typeof lineItem.$inferInsert;
