/**
 * broadcasts router (Plan 08-01 Task 3).
 *
 * Procedures:
 *   - create({targetRoles, title, body, urgency})  — admin only
 *       Inserts a broadcast row AND fans out one notifications row per
 *       target-role recipient in the SAME transaction. RESEARCH Q3 —
 *       transactional fan-out for v1. If scale exceeds ~1000 recipients,
 *       switch to a broadcast_recipient table + pg_cron fanout (deferred).
 *   - listActive()                                 — not-yet-acked broadcasts
 *   - acknowledge({broadcastId})                   — insert broadcast_read
 *
 * Note: user-facing strings use "confirmed" not "approved" per
 * banned-terms rule. Internal role values stay as-is.
 */
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { and, eq, sql } from 'drizzle-orm';
import { broadcast, broadcastRead, users } from '@part61/db';

import { router } from '../trpc';
import { adminProcedure, protectedProcedure } from '../procedures';
import { createNotification } from '../helpers/notifications';

type Tx = {
  insert: typeof import('@part61/db').db.insert;
  select: typeof import('@part61/db').db.select;
  update: typeof import('@part61/db').db.update;
  execute: (q: ReturnType<typeof sql>) => Promise<unknown>;
};

// Lenient UUID pattern matching 07-01 geofence router precedent.
const uuidString = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'Invalid UUID format');

const TARGET_ROLES = ['student', 'instructor', 'mechanic', 'admin', 'all'] as const;

export const broadcastsRouter = router({
  create: adminProcedure
    .input(
      z.object({
        targetRoles: z.array(z.enum(TARGET_ROLES)).min(1),
        title: z.string().min(1).max(200),
        body: z.string().min(1).max(2000),
        urgency: z.enum(['normal', 'urgent']).default('normal'),
        expiresAt: z.string().datetime().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const schoolId = ctx.session!.schoolId;
      const senderId = ctx.session!.userId;

      // Insert broadcast row.
      const [broadcastRow] = await tx
        .insert(broadcast)
        .values({
          schoolId,
          baseId: ctx.session!.activeBaseId ?? null,
          senderId,
          targetRoles: input.targetRoles as unknown as string[],
          title: input.title,
          body: input.body,
          urgency: input.urgency,
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        })
        .returning();

      if (!broadcastRow) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Broadcast insert failed',
        });
      }

      // Resolve recipients (distinct user_id from user_roles joined to
      // users in the same school, filtered by target roles — or all
      // users in the school when targetRoles includes 'all').
      const includeAll = input.targetRoles.includes('all');
      const roleFilter = includeAll
        ? null
        : (input.targetRoles.filter((r) => r !== 'all') as string[]);

      const recipients = includeAll
        ? ((await tx
            .select({ id: users.id })
            .from(users)
            .where(eq(users.schoolId, schoolId))) as Array<{ id: string }>)
        : ((await tx.execute(sql`
            select distinct u.id
              from public.users u
              join public.user_roles ur on ur.user_id = u.id
             where u.school_id = ${schoolId}::uuid
               and ur.role::text in (${sql.join(
                 (roleFilter ?? []).map((r) => sql`${r}`),
                 sql`, `,
               )})
          `)) as unknown as Array<{ id: string }>);

      // Fan out notifications in the same transaction. createNotification
      // respects per-user prefs + role defaults.
      const severity = input.urgency === 'urgent' ? 'critical' : 'info';
      let fanoutCount = 0;
      for (const recipient of recipients) {
        // Skip the sender — no point notifying the admin of their own
        // broadcast.
        if (recipient.id === senderId) continue;
        await createNotification(tx, {
          schoolId,
          userId: recipient.id,
          kind: 'admin_broadcast',
          title: input.title,
          body: input.body,
          linkUrl: `/?broadcast=${broadcastRow.id}`,
          sourceTable: 'broadcast',
          sourceRecordId: broadcastRow.id,
          severity: severity as 'info' | 'critical',
          emailTemplateKey: 'admin_broadcast',
          emailTemplateProps: {
            title: input.title,
            body: input.body,
            urgency: input.urgency,
            senderName: ctx.session!.email,
          },
          baseId: ctx.session!.activeBaseId ?? undefined,
          // Urgent broadcasts also fire a dispatch-screen cue.
          alsoDispatch: input.urgency === 'urgent',
        });
        fanoutCount++;
      }

      return { broadcast: broadcastRow, fanoutCount };
    }),

  listActive: protectedProcedure.query(async ({ ctx }) => {
    const tx = ctx.tx as Tx;
    const userId = ctx.session!.userId;
    const rows = (await tx.execute(sql`
      select b.*
        from public.broadcast b
       where b.school_id = ${ctx.session!.schoolId}::uuid
         and b.is_recalled = false
         and b.deleted_at is null
         and (b.expires_at is null or b.expires_at > now())
         and not exists (
           select 1 from public.broadcast_read r
            where r.broadcast_id = b.id and r.user_id = ${userId}::uuid
         )
       order by b.sent_at desc
    `)) as unknown as Array<Record<string, unknown>>;
    return rows;
  }),

  acknowledge: protectedProcedure
    .input(z.object({ broadcastId: uuidString }))
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      await tx
        .insert(broadcastRead)
        .values({
          broadcastId: input.broadcastId,
          userId: ctx.session!.userId,
        })
        .onConflictDoNothing({
          target: [broadcastRead.broadcastId, broadcastRead.userId],
        });
      return { ok: true };
    }),

  // Admin-only helper used by the admin dashboard to see broadcast
  // delivery stats.
  listAllAdmin: adminProcedure.query(async ({ ctx }) => {
    const tx = ctx.tx as Tx;
    const rows = await tx
      .select()
      .from(broadcast)
      .where(and(eq(broadcast.schoolId, ctx.session!.schoolId), sql`deleted_at is null`));
    return rows;
  }),
});
