/**
 * schedule.freebusy sub-router — thin wrapper around the public.free_busy
 * SQL function (SCH-03 privacy-first schedule visibility).
 */
import { sql } from 'drizzle-orm';
import { freeBusyInput } from '@part61/domain';
import { router } from '../../trpc';
import { protectedProcedure } from '../../procedures';

type Tx = { execute: (q: ReturnType<typeof sql>) => Promise<unknown> };

export const scheduleFreeBusyRouter = router({
  forResource: protectedProcedure
    .input(freeBusyInput)
    .query(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const rows = (await tx.execute(sql`
        select public.free_busy(
          ${input.resourceType}::text,
          ${input.resourceId}::uuid,
          ${input.from.toISOString()}::timestamptz,
          ${input.to.toISOString()}::timestamptz
        ) as range
      `)) as unknown as Array<{ range: string }>;
      return rows.map((r) => r.range);
    }),
});
