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
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { lesson, lineItem, stage } from './syllabus';
import { reservation } from './reservations';
import { studentCourseEnrollment } from './enrollment';
import { bases, schools } from './tenancy';
import { users } from './users';

/**
 * Phase 5 grading + stage check + flight time schemas.
 *
 * Seal triggers on lesson_grade_sheet, stage_check, and course_version
 * live in migration 0018 (fn_syllabus_seal_guard). Drizzle holds
 * columns only; trigger enforcement is invisible to the client.
 */

export const lessonGradeSheetKindEnum = pgEnum('lesson_grade_sheet_kind', [
  'lesson',
  'stage_test',
  'end_of_course_oral',
  'knowledge_test',
]);

export const lessonGradeSheetStatusEnum = pgEnum('lesson_grade_sheet_status', [
  'draft',
  'signed',
  'sealed',
]);

export const stageCheckStatusEnum = pgEnum('stage_check_status', [
  'scheduled',
  'passed',
  'failed',
]);

export const flightLogTimeKindEnum = pgEnum('flight_log_time_kind', [
  'dual_received',
  'dual_given',
  'pic',
  'sic',
  'solo',
]);

// ---------------------------------------------------------------------------
// lesson_grade_sheet
// ---------------------------------------------------------------------------
export const lessonGradeSheet = pgTable(
  'lesson_grade_sheet',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id').notNull().references(() => schools.id),
    baseId: uuid('base_id').references(() => bases.id),
    reservationId: uuid('reservation_id').references(() => reservation.id),
    studentEnrollmentId: uuid('student_enrollment_id').notNull().references(() => studentCourseEnrollment.id),
    lessonId: uuid('lesson_id').notNull().references(() => lesson.id),
    kind: lessonGradeSheetKindEnum('kind').notNull().default('lesson'),
    conductedAt: timestamp('conducted_at', { withTimezone: true }).notNull().defaultNow(),
    conductedByUserId: uuid('conducted_by_user_id').references(() => users.id),
    groundMinutes: integer('ground_minutes').notNull().default(0),
    flightMinutes: integer('flight_minutes').notNull().default(0),
    overallRemarks: text('overall_remarks'),
    status: lessonGradeSheetStatusEnum('status').notNull().default('draft'),
    scoreNumeric: numeric('score_numeric', { precision: 6, scale: 2 }),
    scoreMax: numeric('score_max', { precision: 6, scale: 2 }),
    signerSnapshot: jsonb('signer_snapshot'),
    sealedAt: timestamp('sealed_at', { withTimezone: true }),
    correctsGradeSheetId: uuid('corrects_grade_sheet_id').references(
      (): AnyPgColumn => lessonGradeSheet.id,
    ),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').references(() => users.id),
    updatedBy: uuid('updated_by').references(() => users.id),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  () => [
    pgPolicy('lesson_grade_sheet_select', {
      as: 'permissive',
      for: 'select',
      to: 'authenticated',
      using: sql`school_id = (auth.jwt() ->> 'school_id')::uuid`,
    }),
    pgPolicy('lesson_grade_sheet_modify', {
      as: 'permissive',
      for: 'all',
      to: 'authenticated',
      using: sql`school_id = (auth.jwt() ->> 'school_id')::uuid`,
      withCheck: sql`school_id = (auth.jwt() ->> 'school_id')::uuid`,
    }),
  ],
);

// ---------------------------------------------------------------------------
// line_item_grade
// ---------------------------------------------------------------------------
export const lineItemGrade = pgTable(
  'line_item_grade',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    gradeSheetId: uuid('grade_sheet_id').notNull().references(() => lessonGradeSheet.id),
    lineItemId: uuid('line_item_id').notNull().references(() => lineItem.id),
    gradeValue: text('grade_value').notNull(),
    gradeRemarks: text('grade_remarks'),
    position: integer('position').notNull().default(0),
    // Phase 6 addition (SYL-15): rollover FK to source grade sheet
    rolloverFromGradeSheetId: uuid('rollover_from_grade_sheet_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  () => [
    pgPolicy('line_item_grade_select', {
      as: 'permissive',
      for: 'select',
      to: 'authenticated',
      using: sql`grade_sheet_id in (select id from public.lesson_grade_sheet)`,
    }),
    pgPolicy('line_item_grade_modify', {
      as: 'permissive',
      for: 'all',
      to: 'authenticated',
      using: sql`grade_sheet_id in (select id from public.lesson_grade_sheet)`,
      withCheck: sql`grade_sheet_id in (select id from public.lesson_grade_sheet)`,
    }),
  ],
);

// ---------------------------------------------------------------------------
// stage_check
// ---------------------------------------------------------------------------
export const stageCheck = pgTable(
  'stage_check',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id').notNull().references(() => schools.id),
    baseId: uuid('base_id').references(() => bases.id),
    studentEnrollmentId: uuid('student_enrollment_id').notNull().references(() => studentCourseEnrollment.id),
    stageId: uuid('stage_id').notNull().references(() => stage.id),
    checkerUserId: uuid('checker_user_id').notNull().references(() => users.id),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
    conductedAt: timestamp('conducted_at', { withTimezone: true }),
    status: stageCheckStatusEnum('status').notNull().default('scheduled'),
    remarks: text('remarks'),
    signerSnapshot: jsonb('signer_snapshot'),
    sealedAt: timestamp('sealed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').references(() => users.id),
    updatedBy: uuid('updated_by').references(() => users.id),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  () => [
    pgPolicy('stage_check_select', {
      as: 'permissive',
      for: 'select',
      to: 'authenticated',
      using: sql`school_id = (auth.jwt() ->> 'school_id')::uuid`,
    }),
    pgPolicy('stage_check_modify', {
      as: 'permissive',
      for: 'all',
      to: 'authenticated',
      using: sql`school_id = (auth.jwt() ->> 'school_id')::uuid`,
      withCheck: sql`school_id = (auth.jwt() ->> 'school_id')::uuid`,
    }),
  ],
);

// ---------------------------------------------------------------------------
// flight_log_time
// ---------------------------------------------------------------------------
export const flightLogTime = pgTable(
  'flight_log_time',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id').notNull().references(() => schools.id),
    baseId: uuid('base_id').references(() => bases.id),
    reservationId: uuid('reservation_id').references(() => reservation.id),
    flightLogEntryId: uuid('flight_log_entry_id'),
    userId: uuid('user_id').notNull().references(() => users.id),
    kind: flightLogTimeKindEnum('kind').notNull(),
    dayMinutes: integer('day_minutes').notNull().default(0),
    nightMinutes: integer('night_minutes').notNull().default(0),
    crossCountryMinutes: integer('cross_country_minutes').notNull().default(0),
    instrumentActualMinutes: integer('instrument_actual_minutes').notNull().default(0),
    instrumentSimulatedMinutes: integer('instrument_simulated_minutes').notNull().default(0),
    isSimulator: boolean('is_simulator').notNull().default(false),
    timeInMakeModel: text('time_in_make_model'),
    dayLandings: integer('day_landings').notNull().default(0),
    nightLandings: integer('night_landings').notNull().default(0),
    instrumentApproaches: integer('instrument_approaches').notNull().default(0),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').references(() => users.id),
    updatedBy: uuid('updated_by').references(() => users.id),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  () => [
    pgPolicy('flight_log_time_select', {
      as: 'permissive',
      for: 'select',
      to: 'authenticated',
      using: sql`school_id = (auth.jwt() ->> 'school_id')::uuid`,
    }),
    pgPolicy('flight_log_time_modify', {
      as: 'permissive',
      for: 'all',
      to: 'authenticated',
      using: sql`school_id = (auth.jwt() ->> 'school_id')::uuid`,
      withCheck: sql`school_id = (auth.jwt() ->> 'school_id')::uuid`,
    }),
  ],
);

export type LessonGradeSheet = typeof lessonGradeSheet.$inferSelect;
export type NewLessonGradeSheet = typeof lessonGradeSheet.$inferInsert;
export type LineItemGrade = typeof lineItemGrade.$inferSelect;
export type NewLineItemGrade = typeof lineItemGrade.$inferInsert;
export type StageCheck = typeof stageCheck.$inferSelect;
export type NewStageCheck = typeof stageCheck.$inferInsert;
export type FlightLogTime = typeof flightLogTime.$inferSelect;
export type NewFlightLogTime = typeof flightLogTime.$inferInsert;
