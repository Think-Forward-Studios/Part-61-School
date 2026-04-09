import { sql } from 'drizzle-orm';
import {
  jsonb,
  pgPolicy,
  pgTable,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { auditExceptionKindEnum, auditExceptionSeverityEnum } from './enums';
import { studentCourseEnrollment } from './enrollment';
import { bases, schools } from './tenancy';

/**
 * training_record_audit_exception (SYL-24).
 *
 * Populated by the nightly pg_cron job `run_training_record_audit()`.
 * Each row represents an open (or resolved) audit exception for a
 * student enrollment. UPSERT idempotency enforced via partial unique
 * index on (student_enrollment_id, kind) WHERE resolved_at IS NULL.
 *
 * audit.attach() provides both audit trigger and hard-delete blocker.
 */
export const trainingRecordAuditException = pgTable(
  'training_record_audit_exception',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id),
    baseId: uuid('base_id').references(() => bases.id),
    studentEnrollmentId: uuid('student_enrollment_id')
      .notNull()
      .references(() => studentCourseEnrollment.id),
    kind: auditExceptionKindEnum('kind').notNull(),
    severity: auditExceptionSeverityEnum('severity').notNull(),
    details: jsonb('details').notNull().default(sql`'{}'::jsonb`),
    firstDetectedAt: timestamp('first_detected_at', { withTimezone: true }).notNull().defaultNow(),
    lastDetectedAt: timestamp('last_detected_at', { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  () => [
    pgPolicy('training_record_audit_exception_select_own_school', {
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
    pgPolicy('training_record_audit_exception_modify_own_school', {
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

export type TrainingRecordAuditException = typeof trainingRecordAuditException.$inferSelect;
export type NewTrainingRecordAuditException = typeof trainingRecordAuditException.$inferInsert;
