/**
 * fif router (FTR-07).
 *
 * list     — active notices for the caller's school
 * listUnacked — subset the caller has not yet acknowledged
 * acknowledge — idempotent upsert of an ack row
 * post     — admin posts a new notice
 * revoke   — admin sets expires_at to now()
 */
import { TRPCError } from '@trpc/server';
import { and, eq, sql } from 'drizzle-orm';
import { fifAcknowledgement, fifNotice } from '@part61/db';
import { fifIdInput, fifPostInput } from '@part61/domain';
import { router } from '../trpc';
import { adminProcedure, protectedProcedure } from '../procedures';

type Tx = {
  insert: typeof import('@part61/db').db.insert;
  select: typeof import('@part61/db').db.select;
  update: typeof import('@part61/db').db.update;
  execute: (q: ReturnType<typeof sql>) => Promise<unknown>;
};

export const fifRouter = router({
  listActive: protectedProcedure.query(async ({ ctx }) => {
    const tx = ctx.tx as Tx;
    const rows = (await tx.execute(sql`
      select * from public.fif_notice
       where school_id = ${ctx.session!.schoolId}::uuid
         and deleted_at is null
         and effective_at <= now()
         and (expires_at is null or expires_at > now())
       order by posted_at desc
    `)) as unknown as Array<Record<string, unknown>>;
    return rows;
  }),

  listUnacked: protectedProcedure.query(async ({ ctx }) => {
    const tx = ctx.tx as Tx;
    const rows = (await tx.execute(sql`
      select n.*
        from public.fif_notice n
       where n.school_id = ${ctx.session!.schoolId}::uuid
         and n.deleted_at is null
         and n.effective_at <= now()
         and (n.expires_at is null or n.expires_at > now())
         and not exists (
           select 1 from public.fif_acknowledgement a
            where a.notice_id = n.id
              and a.user_id = ${ctx.session!.userId}::uuid
         )
       order by n.posted_at desc
    `)) as unknown as Array<Record<string, unknown>>;
    return rows;
  }),

  acknowledge: protectedProcedure
    .input(fifIdInput)
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      // Verify notice exists and belongs to this school.
      const noticeRows = await tx
        .select()
        .from(fifNotice)
        .where(
          and(
            eq(fifNotice.id, input.noticeId),
            eq(fifNotice.schoolId, ctx.session!.schoolId),
          ),
        )
        .limit(1);
      if (!noticeRows[0]) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Notice not found' });
      }
      await tx.execute(sql`
        insert into public.fif_acknowledgement (notice_id, user_id, school_id)
        values (
          ${input.noticeId}::uuid,
          ${ctx.session!.userId}::uuid,
          ${ctx.session!.schoolId}::uuid
        )
        on conflict (notice_id, user_id) do nothing
      `);
      return { ok: true };
    }),

  post: adminProcedure
    .input(fifPostInput)
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const rows = await tx
        .insert(fifNotice)
        .values({
          schoolId: ctx.session!.schoolId,
          baseId: input.baseId ?? null,
          title: input.title,
          body: input.body,
          severity: input.severity,
          effectiveAt: input.effectiveAt ?? new Date(),
          expiresAt: input.expiresAt ?? null,
          postedBy: ctx.session!.userId,
        })
        .returning();
      return rows[0]!;
    }),

  revoke: adminProcedure
    .input(fifIdInput)
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      // Expire slightly in the past so listActive immediately excludes it.
      await tx
        .update(fifNotice)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(
          and(
            eq(fifNotice.id, input.noticeId),
            eq(fifNotice.schoolId, ctx.session!.schoolId),
          ),
        );
      return { ok: true };
    }),
});

// Silence unused import.
void fifAcknowledgement;
