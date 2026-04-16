/**
 * me router — returns the resolved session for the current caller.
 * Used by the web layer to populate the header and render the
 * role-switcher dropdown.
 *
 * Phase 8 (08-02): adds getAssignedStudents for instructor dashboard.
 */
import { sql } from 'drizzle-orm';
import { router } from '../trpc';
import { protectedProcedure } from '../procedures';

type Tx = {
  execute: (q: ReturnType<typeof sql>) => Promise<unknown>;
};

export const meRouter = router({
  get: protectedProcedure.query(({ ctx }) => {
    return ctx.session!;
  }),

  /**
   * INS-02 — instructor sees their assigned students' summary.
   * Returns students where the caller is the primary instructor on
   * an active enrollment.
   */
  getAssignedStudents: protectedProcedure.query(async ({ ctx }) => {
    const tx = ctx.tx as Tx;
    const userId = ctx.session!.userId;
    const rows = (await tx.execute(sql`
      select
        e.id           as enrollment_id,
        e.user_id      as student_id,
        u.email        as student_email,
        coalesce(pp.first_name || ' ' || pp.last_name, u.full_name, u.email)
                       as student_name,
        cv.title       as course_name,
        -- stage progress placeholder
        null::text     as current_stage
      from public.student_course_enrollment e
      join public.users u on u.id = e.user_id
      left join public.person_profile pp on pp.user_id = u.id
      left join public.course_version cv on cv.id = e.course_version_id
      where e.primary_instructor_id = ${userId}::uuid
        and e.deleted_at is null
        and e.completed_at is null
        and e.withdrawn_at is null
      order by u.email
      limit 50
    `)) as unknown as Array<Record<string, unknown>>;
    return rows;
  }),
});
