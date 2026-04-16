/**
 * schedule root router — composes reservations, recurring, blocks,
 * freebusy sub-routers into a single namespace mounted at
 * appRouter.schedule.
 *
 * Phase 6 adds evaluateLessonEligibility + suggestNextActivity.
 */
import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { EligibilityResultSchema } from '@part61/domain';
import { router } from '../trpc';
import { protectedProcedure } from '../procedures';
import { scheduleReservationsRouter } from './schedule/reservations';
import { scheduleRecurringRouter } from './schedule/recurring';
import { scheduleBlocksRouter } from './schedule/blocks';
import { scheduleFreeBusyRouter } from './schedule/freebusy';

type Tx = {
  execute: (q: ReturnType<typeof sql>) => Promise<unknown>;
};

export const scheduleRouter = router({
  request: scheduleReservationsRouter.request,
  approve: scheduleReservationsRouter.approve,
  list: scheduleReservationsRouter.list,
  update: scheduleReservationsRouter.update,
  cancel: scheduleReservationsRouter.cancel,
  markNoShow: scheduleReservationsRouter.markNoShow,
  getById: scheduleReservationsRouter.getById,
  checkStudentCurrency: scheduleReservationsRouter.checkStudentCurrency,
  listRequestedForMe: scheduleReservationsRouter.listRequestedForMe,
  recurring: scheduleRecurringRouter,
  blocks: scheduleBlocksRouter,
  freebusy: scheduleFreeBusyRouter,

  /**
   * Phase 6 — evaluateLessonEligibility (SCH-05, SCH-11).
   *
   * Calls the SQL orchestrator and returns typed blockers.
   */
  evaluateLessonEligibility: protectedProcedure
    .input(
      z.object({
        enrollmentId: z.string().uuid(),
        lessonId: z.string().uuid(),
        aircraftId: z.string().uuid(),
        instructorUserId: z.string().uuid(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const rows = (await tx.execute(sql`
        select public.evaluate_lesson_eligibility(
          ${input.enrollmentId}::uuid,
          ${input.lessonId}::uuid,
          ${input.aircraftId}::uuid,
          ${input.instructorUserId}::uuid
        ) as result
      `)) as unknown as Array<{ result: unknown }>;
      const raw = rows[0]?.result;
      if (!raw) return { ok: true, blockers: [] };
      const parsed = EligibilityResultSchema.parse(typeof raw === 'string' ? JSON.parse(raw) : raw);
      return parsed;
    }),

  /**
   * Phase 6 — suggestNextActivity (SCH-14).
   *
   * Returns the next recommended lesson for an enrollment,
   * preferring rollover lessons.
   */
  suggestNextActivity: protectedProcedure
    .input(z.object({ enrollmentId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const rows = (await tx.execute(sql`
        select public.suggest_next_activity(${input.enrollmentId}::uuid) as result
      `)) as unknown as Array<{ result: unknown }>;
      const raw = rows[0]?.result;
      if (!raw) return { lessonId: null, reasoning: 'No activity available' };
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return {
        lessonId: (parsed as { lesson_id?: string }).lesson_id ?? null,
        reasoning: (parsed as { reasoning?: string }).reasoning ?? '',
        blockedBy: (parsed as { blocked_by?: string }).blocked_by ?? undefined,
      };
    }),
});
