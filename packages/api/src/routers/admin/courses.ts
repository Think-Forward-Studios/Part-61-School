/**
 * admin.courses router — Phase 5-03 (SYL-01/03/04).
 *
 * Course / course_version / stage / course_phase / unit / lesson /
 * line_item CRUD. Gated by adminOrChiefInstructorProcedure. All writes
 * go through withTenantTx. Draft-only mutations enforced in the router
 * AND by the DB seal guard (defense-in-depth).
 */
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { and, asc, eq, isNull, or, sql } from 'drizzle-orm';
import { course, courseVersion, stage, coursePhase, unit, lesson, lineItem } from '@part61/db';
import { router } from '../../trpc';
import { adminOrChiefInstructorProcedure } from '../../procedures';

type Tx = {
  insert: typeof import('@part61/db').db.insert;
  select: typeof import('@part61/db').db.select;
  update: typeof import('@part61/db').db.update;
  execute: (q: ReturnType<typeof sql>) => Promise<unknown>;
};

const ratingSoughtSchema = z.enum([
  'private_pilot',
  'instrument_rating',
  'commercial_single_engine',
  'commercial_multi_engine',
  'cfi',
  'cfii',
  'mei',
  'custom',
]);

const gradingScaleSchema = z.enum(['absolute_ipm', 'relative_5', 'pass_fail']);

const lessonKindSchema = z.enum(['ground', 'flight', 'simulator', 'oral', 'written_test']);

const lineItemClassificationSchema = z.enum(['required', 'optional', 'must_pass']);

async function assertDraft(tx: Tx, versionId: string): Promise<void> {
  const rows = await tx
    .select({ publishedAt: courseVersion.publishedAt })
    .from(courseVersion)
    .where(eq(courseVersion.id, versionId))
    .limit(1);
  const row = rows[0];
  if (!row) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Course version not found' });
  }
  if (row.publishedAt) {
    throw new TRPCError({
      code: 'CONFLICT',
      message: 'Course version is published; create a new version to edit.',
    });
  }
}

export const adminCoursesRouter = router({
  // -------------------------------------------------------------------------
  // list — system templates (school_id is null) + school's own courses
  // -------------------------------------------------------------------------
  list: adminOrChiefInstructorProcedure.query(async ({ ctx }) => {
    const tx = ctx.tx as Tx;
    const schoolId = ctx.session!.schoolId;
    const rows = await tx
      .select()
      .from(course)
      .where(
        and(isNull(course.deletedAt), or(isNull(course.schoolId), eq(course.schoolId, schoolId))),
      )
      .orderBy(asc(course.code));
    return rows;
  }),

  // -------------------------------------------------------------------------
  // get — single course + all its versions (own + templates)
  // -------------------------------------------------------------------------
  get: adminOrChiefInstructorProcedure
    .input(z.object({ id: z.string().regex(/^[0-9a-fA-F-]{36}$/) }))
    .query(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const courseRows = await tx
        .select()
        .from(course)
        .where(and(eq(course.id, input.id), isNull(course.deletedAt)))
        .limit(1);
      const c = courseRows[0];
      if (!c) throw new TRPCError({ code: 'NOT_FOUND', message: 'Course not found' });
      const versions = await tx
        .select()
        .from(courseVersion)
        .where(and(eq(courseVersion.courseId, c.id), isNull(courseVersion.deletedAt)))
        .orderBy(asc(courseVersion.createdAt));
      return { course: c, versions };
    }),

  // -------------------------------------------------------------------------
  // getVersion — full tree (stages / phases / units / lessons / line items)
  // -------------------------------------------------------------------------
  getVersion: adminOrChiefInstructorProcedure
    .input(z.object({ versionId: z.string().regex(/^[0-9a-fA-F-]{36}$/) }))
    .query(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const vRows = await tx
        .select()
        .from(courseVersion)
        .where(eq(courseVersion.id, input.versionId))
        .limit(1);
      const version = vRows[0];
      if (!version) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Course version not found' });
      }
      const [stages, phases, units, lessons, lineItems] = await Promise.all([
        tx
          .select()
          .from(stage)
          .where(and(eq(stage.courseVersionId, version.id), isNull(stage.deletedAt)))
          .orderBy(asc(stage.position)),
        tx
          .select()
          .from(coursePhase)
          .where(and(eq(coursePhase.courseVersionId, version.id), isNull(coursePhase.deletedAt)))
          .orderBy(asc(coursePhase.position)),
        tx
          .select()
          .from(unit)
          .where(and(eq(unit.courseVersionId, version.id), isNull(unit.deletedAt)))
          .orderBy(asc(unit.position)),
        tx
          .select()
          .from(lesson)
          .where(and(eq(lesson.courseVersionId, version.id), isNull(lesson.deletedAt)))
          .orderBy(asc(lesson.position)),
        tx
          .select()
          .from(lineItem)
          .where(and(eq(lineItem.courseVersionId, version.id), isNull(lineItem.deletedAt)))
          .orderBy(asc(lineItem.position)),
      ]);
      return { version, stages, phases, units, lessons, lineItems };
    }),

  // -------------------------------------------------------------------------
  // createDraft — new course + first draft version
  // -------------------------------------------------------------------------
  createDraft: adminOrChiefInstructorProcedure
    .input(
      z.object({
        code: z.string().min(1),
        title: z.string().min(1),
        ratingSought: ratingSoughtSchema,
        description: z.string().optional(),
        versionLabel: z.string().min(1).default('v1.0'),
        gradingScale: gradingScaleSchema.default('absolute_ipm'),
        minLevels: z.number().int().min(3).max(6).default(3),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const schoolId = ctx.session!.schoolId;
      const [newCourse] = await tx
        .insert(course)
        .values({
          schoolId,
          code: input.code,
          title: input.title,
          ratingSought: input.ratingSought,
          description: input.description,
          createdBy: ctx.session!.userId,
          updatedBy: ctx.session!.userId,
        })
        .returning();
      const [newVersion] = await tx
        .insert(courseVersion)
        .values({
          courseId: newCourse!.id,
          schoolId,
          versionLabel: input.versionLabel,
          gradingScale: input.gradingScale,
          minLevels: input.minLevels,
          createdBy: ctx.session!.userId,
          updatedBy: ctx.session!.userId,
        })
        .returning();
      return { course: newCourse, version: newVersion };
    }),

  // -------------------------------------------------------------------------
  // createVersion — new version on an existing course (draft)
  // -------------------------------------------------------------------------
  createVersion: adminOrChiefInstructorProcedure
    .input(
      z.object({
        courseId: z.string().regex(/^[0-9a-fA-F-]{36}$/),
        versionLabel: z.string().min(1),
        gradingScale: gradingScaleSchema.default('absolute_ipm'),
        minLevels: z.number().int().min(3).max(6).default(3),
        notes: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const [row] = await tx
        .insert(courseVersion)
        .values({
          courseId: input.courseId,
          schoolId: ctx.session!.schoolId,
          versionLabel: input.versionLabel,
          gradingScale: input.gradingScale,
          minLevels: input.minLevels,
          notes: input.notes,
          createdBy: ctx.session!.userId,
          updatedBy: ctx.session!.userId,
        })
        .returning();
      return row;
    }),

  // -------------------------------------------------------------------------
  // fork — clone a (system or own) version into this school via
  //        public.clone_course_version() pl/pgsql; also creates a new
  //        `course` row so the fork has an owned parent.
  // -------------------------------------------------------------------------
  fork: adminOrChiefInstructorProcedure
    .input(
      z.object({
        sourceVersionId: z.string().regex(/^[0-9a-fA-F-]{36}$/),
        newCode: z.string().min(1),
        newTitle: z.string().min(1),
        description: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const schoolId = ctx.session!.schoolId;

      // Read source version + its course for rating_sought + grading_scale
      const srcRows = (await tx.execute(sql`
        select cv.id as version_id,
               cv.grading_scale,
               cv.min_levels,
               c.rating_sought
          from public.course_version cv
          join public.course c on c.id = cv.course_id
          where cv.id = ${input.sourceVersionId}
          limit 1
      `)) as unknown as Array<{
        version_id: string;
        grading_scale: 'absolute_ipm' | 'relative_5' | 'pass_fail';
        min_levels: number;
        rating_sought:
          | 'private_pilot'
          | 'instrument_rating'
          | 'commercial_single_engine'
          | 'commercial_multi_engine'
          | 'cfi'
          | 'cfii'
          | 'mei'
          | 'custom';
      }>;
      const src = srcRows[0];
      if (!src) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Source version not found' });
      }

      // Create the owned course shell
      const [newCourse] = await tx
        .insert(course)
        .values({
          schoolId,
          code: input.newCode,
          title: input.newTitle,
          ratingSought: src.rating_sought,
          description: input.description,
          createdBy: ctx.session!.userId,
          updatedBy: ctx.session!.userId,
        })
        .returning();

      // Deep-clone via pl/pgsql helper; returns the new course_version uuid.
      // The helper runs SECURITY INVOKER so RLS flows through.
      const cloneRows = (await tx.execute(sql`
        select public.clone_course_version(${input.sourceVersionId}::uuid, ${schoolId}::uuid) as new_version_id
      `)) as unknown as Array<{ new_version_id: string }>;
      const newVersionId = cloneRows[0]?.new_version_id;
      if (!newVersionId) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'clone_course_version returned no row',
        });
      }

      // Re-parent the cloned version onto the owned course shell
      await tx
        .update(courseVersion)
        .set({ courseId: newCourse!.id, updatedBy: ctx.session!.userId })
        .where(eq(courseVersion.id, newVersionId));

      return { course: newCourse, versionId: newVersionId };
    }),

  // -------------------------------------------------------------------------
  // publish — set published_at on a draft (transitive seal activates)
  // -------------------------------------------------------------------------
  publish: adminOrChiefInstructorProcedure
    .input(z.object({ versionId: z.string().regex(/^[0-9a-fA-F-]{36}$/) }))
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      await assertDraft(tx, input.versionId);
      const [row] = await tx
        .update(courseVersion)
        .set({
          publishedAt: new Date(),
          publishedBy: ctx.session!.userId,
          updatedBy: ctx.session!.userId,
        })
        .where(eq(courseVersion.id, input.versionId))
        .returning();
      return row;
    }),

  // -------------------------------------------------------------------------
  // Tree mutations — all require a draft version
  // -------------------------------------------------------------------------
  addStage: adminOrChiefInstructorProcedure
    .input(
      z.object({
        versionId: z.string().regex(/^[0-9a-fA-F-]{36}$/),
        position: z.number().int().min(0),
        code: z.string().min(1),
        title: z.string().min(1),
        objectives: z.string().optional(),
        completionStandards: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      await assertDraft(tx, input.versionId);
      const [row] = await tx
        .insert(stage)
        .values({
          schoolId: ctx.session!.schoolId,
          courseVersionId: input.versionId,
          position: input.position,
          code: input.code,
          title: input.title,
          objectives: input.objectives,
          completionStandards: input.completionStandards,
          createdBy: ctx.session!.userId,
          updatedBy: ctx.session!.userId,
        })
        .returning();
      return row;
    }),

  addPhase: adminOrChiefInstructorProcedure
    .input(
      z.object({
        versionId: z.string().regex(/^[0-9a-fA-F-]{36}$/),
        stageId: z.string().regex(/^[0-9a-fA-F-]{36}$/),
        position: z.number().int().min(0),
        code: z.string().min(1),
        title: z.string().min(1),
        objectives: z.string().optional(),
        completionStandards: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      await assertDraft(tx, input.versionId);
      const [row] = await tx
        .insert(coursePhase)
        .values({
          schoolId: ctx.session!.schoolId,
          courseVersionId: input.versionId,
          stageId: input.stageId,
          position: input.position,
          code: input.code,
          title: input.title,
          objectives: input.objectives,
          completionStandards: input.completionStandards,
          createdBy: ctx.session!.userId,
          updatedBy: ctx.session!.userId,
        })
        .returning();
      return row;
    }),

  addUnit: adminOrChiefInstructorProcedure
    .input(
      z.object({
        versionId: z.string().regex(/^[0-9a-fA-F-]{36}$/),
        stageId: z
          .string()
          .regex(/^[0-9a-fA-F-]{36}$/)
          .optional(),
        coursePhaseId: z
          .string()
          .regex(/^[0-9a-fA-F-]{36}$/)
          .optional(),
        position: z.number().int().min(0),
        code: z.string().min(1),
        title: z.string().min(1),
        objectives: z.string().optional(),
        completionStandards: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!!input.stageId === !!input.coursePhaseId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'unit must have exactly one of stageId or coursePhaseId',
        });
      }
      const tx = ctx.tx as Tx;
      await assertDraft(tx, input.versionId);
      const [row] = await tx
        .insert(unit)
        .values({
          schoolId: ctx.session!.schoolId,
          courseVersionId: input.versionId,
          stageId: input.stageId,
          coursePhaseId: input.coursePhaseId,
          position: input.position,
          code: input.code,
          title: input.title,
          objectives: input.objectives,
          completionStandards: input.completionStandards,
          createdBy: ctx.session!.userId,
          updatedBy: ctx.session!.userId,
        })
        .returning();
      return row;
    }),

  addLesson: adminOrChiefInstructorProcedure
    .input(
      z.object({
        versionId: z.string().regex(/^[0-9a-fA-F-]{36}$/),
        stageId: z
          .string()
          .regex(/^[0-9a-fA-F-]{36}$/)
          .optional(),
        coursePhaseId: z
          .string()
          .regex(/^[0-9a-fA-F-]{36}$/)
          .optional(),
        unitId: z
          .string()
          .regex(/^[0-9a-fA-F-]{36}$/)
          .optional(),
        position: z.number().int().min(0),
        code: z.string().min(1),
        title: z.string().min(1),
        kind: lessonKindSchema,
        objectives: z.string().optional(),
        completionStandards: z.string().optional(),
        minHours: z.number().nonnegative().optional(),
        requiredResources: z.array(z.unknown()).optional(),
        requiredCurrencies: z.array(z.unknown()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const parentCount =
        (input.stageId ? 1 : 0) + (input.coursePhaseId ? 1 : 0) + (input.unitId ? 1 : 0);
      if (parentCount !== 1) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'lesson must have exactly one of stageId / coursePhaseId / unitId',
        });
      }
      const tx = ctx.tx as Tx;
      await assertDraft(tx, input.versionId);
      const [row] = await tx
        .insert(lesson)
        .values({
          schoolId: ctx.session!.schoolId,
          courseVersionId: input.versionId,
          stageId: input.stageId,
          coursePhaseId: input.coursePhaseId,
          unitId: input.unitId,
          position: input.position,
          code: input.code,
          title: input.title,
          kind: input.kind,
          objectives: input.objectives,
          completionStandards: input.completionStandards,
          minHours: input.minHours != null ? String(input.minHours) : undefined,
          requiredResources: input.requiredResources ?? [],
          requiredCurrencies: input.requiredCurrencies ?? [],
          createdBy: ctx.session!.userId,
          updatedBy: ctx.session!.userId,
        })
        .returning();
      return row;
    }),

  addLineItem: adminOrChiefInstructorProcedure
    .input(
      z.object({
        versionId: z.string().regex(/^[0-9a-fA-F-]{36}$/),
        lessonId: z.string().regex(/^[0-9a-fA-F-]{36}$/),
        position: z.number().int().min(0),
        code: z.string().min(1),
        title: z.string().min(1),
        description: z.string().optional(),
        objectives: z.string().optional(),
        completionStandards: z.string().optional(),
        classification: lineItemClassificationSchema.default('required'),
        gradingScaleOverride: gradingScaleSchema.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      await assertDraft(tx, input.versionId);
      const [row] = await tx
        .insert(lineItem)
        .values({
          schoolId: ctx.session!.schoolId,
          courseVersionId: input.versionId,
          lessonId: input.lessonId,
          position: input.position,
          code: input.code,
          title: input.title,
          description: input.description,
          objectives: input.objectives,
          completionStandards: input.completionStandards,
          classification: input.classification,
          gradingScaleOverride: input.gradingScaleOverride,
          createdBy: ctx.session!.userId,
          updatedBy: ctx.session!.userId,
        })
        .returning();
      return row;
    }),

  updateLineItem: adminOrChiefInstructorProcedure
    .input(
      z.object({
        versionId: z.string().regex(/^[0-9a-fA-F-]{36}$/),
        lineItemId: z.string().regex(/^[0-9a-fA-F-]{36}$/),
        title: z.string().min(1).optional(),
        description: z.string().optional(),
        objectives: z.string().optional(),
        completionStandards: z.string().optional(),
        classification: lineItemClassificationSchema.optional(),
        position: z.number().int().min(0).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      await assertDraft(tx, input.versionId);
      const patch: Record<string, unknown> = {
        updatedBy: ctx.session!.userId,
        updatedAt: new Date(),
      };
      if (input.title !== undefined) patch.title = input.title;
      if (input.description !== undefined) patch.description = input.description;
      if (input.objectives !== undefined) patch.objectives = input.objectives;
      if (input.completionStandards !== undefined)
        patch.completionStandards = input.completionStandards;
      if (input.classification !== undefined) patch.classification = input.classification;
      if (input.position !== undefined) patch.position = input.position;
      const [row] = await tx
        .update(lineItem)
        .set(patch)
        .where(eq(lineItem.id, input.lineItemId))
        .returning();
      if (!row) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Line item not found' });
      }
      return row;
    }),

  softDelete: adminOrChiefInstructorProcedure
    .input(z.object({ courseId: z.string().regex(/^[0-9a-fA-F-]{36}$/) }))
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      // Refuse if any version is published
      const rows = (await tx.execute(sql`
        select 1
          from public.course_version cv
          where cv.course_id = ${input.courseId}
            and cv.published_at is not null
            and cv.deleted_at is null
          limit 1
      `)) as unknown as Array<unknown>;
      if (rows && rows.length > 0) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Cannot soft-delete a course with published versions',
        });
      }
      const [row] = await tx
        .update(course)
        .set({ deletedAt: new Date(), updatedBy: ctx.session!.userId })
        .where(eq(course.id, input.courseId))
        .returning();
      return row;
    }),
});
