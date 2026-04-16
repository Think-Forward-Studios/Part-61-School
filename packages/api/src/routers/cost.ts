/**
 * cost router — REP-03, REP-04.
 *
 * Student training cost: live (to-date) and projected (through completion).
 * Access: admin, assigned instructor, or the student themselves.
 */
import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { router } from '../trpc';
import { protectedProcedure } from '../procedures';
import { computeLiveCost, computeProjectedCost } from '../helpers/cost';

type Tx = {
  execute: (q: ReturnType<typeof sql>) => Promise<unknown>;
};

export const costRouter = router({
  getForStudent: protectedProcedure
    .input(
      z.object({
        studentId: z.string().uuid().optional(),
        enrollmentId: z.string().uuid().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const callerId = ctx.session!.userId;
      const schoolId = ctx.session!.schoolId;
      const activeRole = ctx.session!.activeRole;
      const studentId = input.studentId ?? callerId;

      // Access check: admin can query anyone; instructor can query
      // assigned students; student can query self only.
      if (studentId !== callerId && activeRole !== 'admin') {
        // Check if instructor is assigned to this student
        if (activeRole === 'instructor') {
          const check = (await tx.execute(sql`
            select 1 from public.student_course_enrollment
            where user_id = ${studentId}::uuid
              and primary_instructor_id = ${callerId}::uuid
              and deleted_at is null
            limit 1
          `)) as unknown as Array<unknown>;
          if (check.length === 0) {
            return {
              liveCents: 0,
              projectedCents: null,
              breakdown: null,
              currency: 'USD',
              missingRates: [],
            };
          }
        } else {
          return {
            liveCents: 0,
            projectedCents: null,
            breakdown: null,
            currency: 'USD',
            missingRates: [],
          };
        }
      }

      const live = await computeLiveCost(tx, { studentId, schoolId });

      let projectedCents: number | null = null;
      if (input.enrollmentId) {
        const projected = await computeProjectedCost(tx, {
          studentId,
          enrollmentId: input.enrollmentId,
          schoolId,
        });
        projectedCents = projected?.projectedTotalCents ?? null;
      }

      return {
        liveCents: live.totalCents,
        projectedCents,
        breakdown: live.breakdown,
        currency: live.currency,
        missingRates: live.missingRates,
      };
    }),
});
