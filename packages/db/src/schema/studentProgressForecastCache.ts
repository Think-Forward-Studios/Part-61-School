import { sql } from 'drizzle-orm';
import {
  date,
  numeric,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { studentCourseEnrollment } from './enrollment';
import { bases, schools } from './tenancy';

/**
 * student_progress_forecast_cache (SYL-22, SYL-23).
 *
 * Cache table mirroring Phase 4 aircraft_downtime_forecast pattern.
 * One row per active enrollment, keyed by student_enrollment_id (PK).
 * Refreshed by trigger on flight_log_time insert/update and cadence
 * mutations.
 *
 * No hard-delete blocker: cache rows are evictable via ON DELETE
 * CASCADE from enrollment. Audit-only trigger for observability.
 */
export const studentProgressForecastCache = pgTable(
  'student_progress_forecast_cache',
  {
    studentEnrollmentId: uuid('student_enrollment_id')
      .primaryKey()
      .references(() => studentCourseEnrollment.id, { onDelete: 'cascade' }),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id),
    baseId: uuid('base_id')
      .notNull()
      .references(() => bases.id),
    computedAt: timestamp('computed_at', { withTimezone: true }).notNull().defaultNow(),
    expectedHoursToDate: numeric('expected_hours_to_date').notNull(),
    actualHoursToDate: numeric('actual_hours_to_date').notNull(),
    aheadBehindHours: numeric('ahead_behind_hours').notNull(),
    aheadBehindWeeks: numeric('ahead_behind_weeks').notNull(),
    remainingHours: numeric('remaining_hours').notNull(),
    projectedCheckrideDate: date('projected_checkride_date'),
    projectedCompletionDate: date('projected_completion_date'),
    confidence: text('confidence').notNull(),
  },
  () => [
    pgPolicy('student_progress_forecast_cache_select', {
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
    pgPolicy('student_progress_forecast_cache_modify', {
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

export type StudentProgressForecastCache = typeof studentProgressForecastCache.$inferSelect;
export type NewStudentProgressForecastCache = typeof studentProgressForecastCache.$inferInsert;
