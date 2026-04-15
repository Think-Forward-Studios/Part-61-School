/**
 * gradeSheet router — Phase 5-03 (SYL-06/07/08/25).
 *
 * Instructor grading ceremony:
 *   - createFromReservation — draft sheet + stub line_item_grade rows
 *   - setGrade              — draft only; validates against scale
 *   - setOverallRemarks     — draft only
 *   - setGroundFlightMinutes— draft only
 *   - seal                  — enforces must_pass passing, signs, seals
 *   - recordTestGrade       — writes test_grade row + seals
 *
 * Gated by instructorOrAdminProcedure. DB seal trigger (0018) is the
 * immutability backstop; this router refuses mutations on sealed sheets.
 */
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { and, asc, eq, sql } from 'drizzle-orm';
import {
  courseVersion,
  lesson,
  lessonGradeSheet,
  lineItem,
  lineItemGrade,
  reservation,
  testGrade,
} from '@part61/db';
import { isPassingGrade, type GradingScale } from '@part61/domain';
import { router } from '../trpc';
import { instructorOrAdminProcedure } from '../procedures';
import { buildInstructorSignerSnapshot } from '../helpers/buildInstructorSignerSnapshot';
import { createNotification } from '../helpers/notifications';
import { studentCourseEnrollment } from '@part61/db';

type Tx = {
  insert: typeof import('@part61/db').db.insert;
  select: typeof import('@part61/db').db.select;
  update: typeof import('@part61/db').db.update;
  execute: (q: ReturnType<typeof import('drizzle-orm').sql>) => Promise<unknown>;
};

function validateGradeForScale(scale: GradingScale, value: string): void {
  const ok =
    scale === 'absolute_ipm'
      ? ['I', 'P', 'PM', 'M'].includes(value)
      : scale === 'relative_5'
        ? ['1', '2', '3', '4', '5'].includes(value)
        : ['pass', 'fail'].includes(value);
  if (!ok) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `Grade "${value}" is not valid for scale ${scale}`,
    });
  }
}

async function loadDraft(tx: Tx, gradeSheetId: string) {
  const rows = await tx
    .select()
    .from(lessonGradeSheet)
    .where(eq(lessonGradeSheet.id, gradeSheetId))
    .limit(1);
  const sheet = rows[0];
  if (!sheet) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Grade sheet not found' });
  }
  if (sheet.sealedAt || sheet.status === 'sealed') {
    throw new TRPCError({
      code: 'CONFLICT',
      message: 'Grade sheet is sealed and cannot be modified',
    });
  }
  return sheet;
}

export const gradeSheetRouter = router({
  createFromReservation: instructorOrAdminProcedure
    .input(
      z.object({
        reservationId: z.string().uuid(),
        lessonId: z.string().uuid(),
        studentEnrollmentId: z.string().uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      // Load reservation to inherit school/base
      const resRows = await tx
        .select()
        .from(reservation)
        .where(eq(reservation.id, input.reservationId))
        .limit(1);
      const res = resRows[0];
      if (!res) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Reservation not found' });
      }

      // Phase 6 — Step 1: Lock candidate override (SELECT FOR UPDATE)
      const overrideRows = (await tx.execute(sql`
        select id from public.lesson_override
        where student_enrollment_id = ${input.studentEnrollmentId}::uuid
          and lesson_id = ${input.lessonId}::uuid
          and consumed_at is null
          and revoked_at is null
          and expires_at > now()
        for update
        limit 1
      `)) as unknown as Array<{ id: string }>;
      const overrideId: string | null = overrideRows[0]?.id ?? null;

      // Phase 6 — Step 2: If no override, evaluate eligibility
      if (!overrideId) {
        const eligRows = (await tx.execute(sql`
          select public.evaluate_lesson_eligibility(
            ${input.studentEnrollmentId}::uuid,
            ${input.lessonId}::uuid,
            ${res.aircraftId ?? null}::uuid,
            ${ctx.session!.userId}::uuid
          ) as result
        `)) as unknown as Array<{ result: unknown }>;
        const raw = eligRows[0]?.result;
        if (raw) {
          const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
          const result = parsed as {
            ok: boolean;
            blockers?: Array<{ kind: string; detail: unknown }>;
          };
          if (!result.ok) {
            throw new TRPCError({
              code: 'PRECONDITION_FAILED',
              message: 'Lesson eligibility blockers present',
              cause: { blockers: result.blockers ?? [] },
            });
          }
        }
      }

      // Phase 6 — Step 3: If override exists, consume it atomically
      if (overrideId) {
        await tx.execute(
          sql`update public.lesson_override set consumed_at = now() where id = ${overrideId}::uuid`,
        );
      }

      // Phase 6 — Step 4: Compute rollover line items
      const rolloverRows = (await tx.execute(sql`
        select source_grade_sheet_id, line_item_id
        from public.compute_rollover_line_items(
          ${input.studentEnrollmentId}::uuid,
          ${input.lessonId}::uuid
        )
      `)) as unknown as Array<{
        source_grade_sheet_id: string;
        line_item_id: string;
      }>;

      // Step 5: Create draft grade sheet (existing Phase 5 logic)
      const [sheet] = await tx
        .insert(lessonGradeSheet)
        .values({
          schoolId: res.schoolId,
          baseId: res.baseId,
          reservationId: res.id,
          studentEnrollmentId: input.studentEnrollmentId,
          lessonId: input.lessonId,
          conductedByUserId: ctx.session!.userId,
          status: 'draft',
          createdBy: ctx.session!.userId,
          updatedBy: ctx.session!.userId,
        })
        .returning();

      // Step 6: Pre-fill line_item_grade rows + rollover stubs
      const items = await tx
        .select()
        .from(lineItem)
        .where(eq(lineItem.lessonId, input.lessonId))
        .orderBy(asc(lineItem.position));

      // Build base stubs for the lesson's own line items
      const stubs: Array<{
        gradeSheetId: string;
        lineItemId: string;
        gradeValue: string;
        position: number;
        rolloverFromGradeSheetId?: string | null;
      }> = items.map((li) => ({
        gradeSheetId: sheet!.id,
        lineItemId: li.id,
        gradeValue: '',
        position: li.position,
      }));

      // Add rollover stubs (in ADDITION to the lesson's own items).
      let rolloverPosition = items.length;
      for (const rr of rolloverRows) {
        // Rollover rows are in ADDITION to the lesson's own items.
        // If the same line_item_id is already in the lesson, insert
        // an additional stub tagged with rollover_from_grade_sheet_id.
        stubs.push({
          gradeSheetId: sheet!.id,
          lineItemId: rr.line_item_id,
          gradeValue: '',
          position: rolloverPosition++,
          rolloverFromGradeSheetId: rr.source_grade_sheet_id,
        });
      }

      if (stubs.length > 0) {
        await tx.insert(lineItemGrade).values(stubs);
      }

      return sheet;
    }),

  setGrade: instructorOrAdminProcedure
    .input(
      z.object({
        gradeSheetId: z.string().uuid(),
        lineItemId: z.string().uuid(),
        gradeValue: z.string().min(1),
        gradeRemarks: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      await loadDraft(tx, input.gradeSheetId);

      // Determine scale: line item override, else course_version default
      const liRows = await tx
        .select()
        .from(lineItem)
        .where(eq(lineItem.id, input.lineItemId))
        .limit(1);
      const li = liRows[0];
      if (!li) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Line item not found' });
      }
      let scale: GradingScale;
      if (li.gradingScaleOverride) {
        scale = li.gradingScaleOverride as GradingScale;
      } else {
        const cvRows = await tx
          .select({ gradingScale: courseVersion.gradingScale })
          .from(courseVersion)
          .where(eq(courseVersion.id, li.courseVersionId))
          .limit(1);
        scale = (cvRows[0]?.gradingScale ?? 'absolute_ipm') as GradingScale;
      }
      validateGradeForScale(scale, input.gradeValue);

      // Upsert-style: update existing stub
      const [row] = await tx
        .update(lineItemGrade)
        .set({
          gradeValue: input.gradeValue,
          gradeRemarks: input.gradeRemarks,
        })
        .where(
          and(
            eq(lineItemGrade.gradeSheetId, input.gradeSheetId),
            eq(lineItemGrade.lineItemId, input.lineItemId),
          ),
        )
        .returning();
      if (!row) {
        // Insert if the stub wasn't pre-filled
        const [inserted] = await tx
          .insert(lineItemGrade)
          .values({
            gradeSheetId: input.gradeSheetId,
            lineItemId: input.lineItemId,
            gradeValue: input.gradeValue,
            gradeRemarks: input.gradeRemarks,
            position: li.position,
          })
          .returning();
        return inserted;
      }
      return row;
    }),

  setOverallRemarks: instructorOrAdminProcedure
    .input(
      z.object({
        gradeSheetId: z.string().uuid(),
        overallRemarks: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      await loadDraft(tx, input.gradeSheetId);
      const [row] = await tx
        .update(lessonGradeSheet)
        .set({
          overallRemarks: input.overallRemarks,
          updatedBy: ctx.session!.userId,
          updatedAt: new Date(),
        })
        .where(eq(lessonGradeSheet.id, input.gradeSheetId))
        .returning();
      return row;
    }),

  setGroundFlightMinutes: instructorOrAdminProcedure
    .input(
      z.object({
        gradeSheetId: z.string().uuid(),
        groundMinutes: z.number().int().min(0),
        flightMinutes: z.number().int().min(0),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      await loadDraft(tx, input.gradeSheetId);
      const [row] = await tx
        .update(lessonGradeSheet)
        .set({
          groundMinutes: input.groundMinutes,
          flightMinutes: input.flightMinutes,
          updatedBy: ctx.session!.userId,
          updatedAt: new Date(),
        })
        .where(eq(lessonGradeSheet.id, input.gradeSheetId))
        .returning();
      return row;
    }),

  seal: instructorOrAdminProcedure
    .input(z.object({ gradeSheetId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const sheet = await loadDraft(tx, input.gradeSheetId);

      // Load lesson → course_version to know the grading scale
      const lessonRows = await tx
        .select()
        .from(lesson)
        .where(eq(lesson.id, sheet.lessonId))
        .limit(1);
      const l = lessonRows[0];
      if (!l) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Lesson not found' });
      }
      const cvRows = await tx
        .select({ gradingScale: courseVersion.gradingScale })
        .from(courseVersion)
        .where(eq(courseVersion.id, l.courseVersionId))
        .limit(1);
      const defaultScale = (cvRows[0]?.gradingScale ?? 'absolute_ipm') as GradingScale;

      // Load line items + grades
      const items = await tx.select().from(lineItem).where(eq(lineItem.lessonId, sheet.lessonId));
      const grades = await tx
        .select()
        .from(lineItemGrade)
        .where(eq(lineItemGrade.gradeSheetId, sheet.id));
      const gradeByLineItem = new Map(grades.map((g) => [g.lineItemId, g]));

      // Validate: required items must have a non-empty grade; must_pass items
      // must have a passing grade.
      for (const li of items) {
        if (li.classification === 'optional') continue;
        const g = gradeByLineItem.get(li.id);
        if (!g || !g.gradeValue || g.gradeValue.trim() === '') {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: `Line item ${li.code} is required but has no grade`,
          });
        }
        if (li.classification === 'must_pass') {
          const scale = (li.gradingScaleOverride as GradingScale | null) ?? defaultScale;
          if (!isPassingGrade(scale, g.gradeValue)) {
            throw new TRPCError({
              code: 'PRECONDITION_FAILED',
              message: `Must-pass line item ${li.code} does not have a passing grade`,
            });
          }
        }
      }

      const snapshot = await buildInstructorSignerSnapshot(
        tx,
        ctx.session!.userId,
        ctx.session!.activeRole,
      );
      const now = new Date();
      const [row] = await tx
        .update(lessonGradeSheet)
        .set({
          status: 'sealed',
          sealedAt: now,
          signerSnapshot: snapshot as unknown as Record<string, unknown>,
          updatedBy: ctx.session!.userId,
          updatedAt: now,
        })
        .where(eq(lessonGradeSheet.id, sheet.id))
        .returning();

      // Phase 8 NOT-01: notify the student that grading is complete.
      const enrollmentRows = await tx
        .select()
        .from(studentCourseEnrollment)
        .where(eq(studentCourseEnrollment.id, sheet.studentEnrollmentId))
        .limit(1);
      const enr = enrollmentRows[0];
      if (enr?.userId) {
        await createNotification(tx, {
          schoolId: sheet.schoolId,
          baseId: sheet.baseId,
          userId: enr.userId,
          kind: 'grading_complete',
          title: 'Your lesson has been graded',
          body: `${l.title ?? 'Lesson'} is complete — open your record to see the grade.`,
          linkUrl: '/record',
          sourceTable: 'lesson_grade_sheet',
          sourceRecordId: sheet.id,
          emailTemplateKey: 'grading_complete',
          emailTemplateProps: {
            studentName: 'Student',
            instructorName: ctx.session!.email ?? 'Your instructor',
            lessonTitle: l.title ?? 'Lesson',
            recordUrl: '/record',
          },
        });
      }

      return row;
    }),

  recordTestGrade: instructorOrAdminProcedure
    .input(
      z.object({
        studentEnrollmentId: z.string().uuid(),
        componentKind: z.enum(['course', 'stage', 'course_phase', 'unit', 'lesson', 'line_item']),
        componentId: z.string().uuid(),
        testKind: z.enum(['knowledge', 'oral', 'end_of_stage', 'practical']),
        score: z.number().optional(),
        maxScore: z.number().optional(),
        remarks: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const snapshot = await buildInstructorSignerSnapshot(
        tx,
        ctx.session!.userId,
        ctx.session!.activeRole,
      );
      const now = new Date();
      const [row] = await tx
        .insert(testGrade)
        .values({
          schoolId: ctx.session!.schoolId,
          studentEnrollmentId: input.studentEnrollmentId,
          componentKind: input.componentKind,
          componentId: input.componentId,
          testKind: input.testKind,
          score: input.score != null ? String(input.score) : null,
          maxScore: input.maxScore != null ? String(input.maxScore) : null,
          remarks: input.remarks,
          signerSnapshot: snapshot as unknown as Record<string, unknown>,
          sealed: true,
          sealedAt: now,
          recordedBy: ctx.session!.userId,
        })
        .returning();
      return row;
    }),
});
