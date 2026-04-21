/**
 * notifications router (Plan 08-01 Task 3).
 *
 * Procedures:
 *   - list()              — most recent notifications for current user
 *   - unreadCount()       — fast badge count
 *   - markRead({id})      — mark one row read
 *   - markAllRead()       — mark all current-user rows read
 *   - listPrefs()         — effective prefs (user override OR role default)
 *   - updatePref(...)     — upsert user_notification_pref row
 *
 * All procedures run under withTenantTx; RLS enforces user_id = auth.uid()
 * so cross-user leakage is impossible.
 */
import { z } from 'zod';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { notifications, userNotificationPref } from '@part61/db';

import { router } from '../trpc';
import { protectedProcedure } from '../procedures';

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

const NOTIFICATION_KINDS = [
  'reservation_requested',
  'reservation_approved',
  'reservation_changed',
  'reservation_cancelled',
  'reservation_reminder_24h',
  'grading_complete',
  'squawk_opened',
  'squawk_grounding',
  'squawk_returned_to_service',
  'document_expiring',
  'currency_expiring',
  'overdue_aircraft',
  'grounded_aircraft_attempted_use',
  'admin_broadcast',
  'duty_hour_warning',
] as const;

const NOTIFICATION_CHANNELS = ['in_app', 'email', 'dispatch'] as const;

export const notificationsRouter = router({
  list: protectedProcedure
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(200).optional(),
          onlyUnread: z.boolean().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const limit = input?.limit ?? 50;
      const onlyUnread = input?.onlyUnread ?? false;
      const userId = ctx.session!.userId;

      const rows = onlyUnread
        ? await tx
            .select()
            .from(notifications)
            .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
            .orderBy(desc(notifications.createdAt))
            .limit(limit)
        : await tx
            .select()
            .from(notifications)
            .where(eq(notifications.userId, userId))
            .orderBy(desc(notifications.createdAt))
            .limit(limit);
      return rows;
    }),

  unreadCount: protectedProcedure.query(async ({ ctx }) => {
    const tx = ctx.tx as Tx;
    const rows = (await tx.execute(sql`
      select count(*)::int as count
        from public.notifications
       where user_id = ${ctx.session!.userId}::uuid
         and read_at is null
    `)) as unknown as Array<{ count: number }>;
    return rows[0]?.count ?? 0;
  }),

  markRead: protectedProcedure
    .input(z.object({ id: uuidString }))
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const updated = await tx
        .update(notifications)
        .set({ readAt: new Date() })
        .where(and(eq(notifications.id, input.id), eq(notifications.userId, ctx.session!.userId)))
        .returning();
      return updated[0] ?? null;
    }),

  markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
    const tx = ctx.tx as Tx;
    const result = (await tx.execute(sql`
      update public.notifications
         set read_at = now()
       where user_id = ${ctx.session!.userId}::uuid
         and read_at is null
      returning id
    `)) as unknown as Array<{ id: string }>;
    return { markedCount: result.length };
  }),

  listPrefs: protectedProcedure.query(async ({ ctx }) => {
    const tx = ctx.tx as Tx;
    // Effective pref for each (kind, channel) pair. LEFT JOIN
    // user_notification_pref onto notification_default_by_role by the
    // caller's active role.
    const rows = (await tx.execute(sql`
      with kinds as (
        select unnest(enum_range(null::public.notification_event_kind)) as kind
      ),
      channels as (
        select unnest(array['in_app','email','dispatch'])::public.notification_channel as channel
      ),
      matrix as (
        select k.kind, c.channel from kinds k cross join channels c
      )
      select
        m.kind::text     as kind,
        m.channel::text  as channel,
        coalesce(
          (select enabled from public.user_notification_pref p
            where p.user_id = ${ctx.session!.userId}::uuid
              and p.kind    = m.kind
              and p.channel = m.channel
           limit 1),
          (select enabled from public.notification_default_by_role d
            where d.role    = ${ctx.session!.activeRole}::text
              and d.kind    = m.kind
              and d.channel = m.channel
           limit 1),
          false
        ) as enabled,
        (select d.is_safety_critical from public.notification_default_by_role d
          where d.role = ${ctx.session!.activeRole}::text
            and d.kind = m.kind
            and d.channel = m.channel
         limit 1) as is_safety_critical,
        (select 1 from public.user_notification_pref p
          where p.user_id = ${ctx.session!.userId}::uuid
            and p.kind    = m.kind
            and p.channel = m.channel
         limit 1) is not null as has_user_override
      from matrix m
      order by m.kind::text, m.channel::text
    `)) as unknown as Array<{
      kind: string;
      channel: string;
      enabled: boolean;
      is_safety_critical: boolean | null;
      has_user_override: boolean;
    }>;
    return rows;
  }),

  updatePref: protectedProcedure
    .input(
      z.object({
        kind: z.enum(NOTIFICATION_KINDS),
        channel: z.enum(NOTIFICATION_CHANNELS),
        enabled: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      await tx
        .insert(userNotificationPref)
        .values({
          userId: ctx.session!.userId,
          kind: input.kind,
          channel: input.channel,
          enabled: input.enabled,
        })
        .onConflictDoUpdate({
          target: [
            userNotificationPref.userId,
            userNotificationPref.kind,
            userNotificationPref.channel,
          ],
          set: { enabled: input.enabled, updatedAt: new Date() },
        });
      return { ok: true };
    }),

  /**
   * Bulk upsert of notification prefs — powers the "enable/disable all
   * in this section" and "enable/disable everything" toggles on
   * /profile/notifications. One statement per row inside the same
   * tenant transaction; atomically commits or rolls back the whole
   * batch.
   */
  updatePrefs: protectedProcedure
    .input(
      z.object({
        items: z
          .array(
            z.object({
              kind: z.enum(NOTIFICATION_KINDS),
              channel: z.enum(NOTIFICATION_CHANNELS),
              enabled: z.boolean(),
            }),
          )
          .min(1)
          .max(100),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const userId = ctx.session!.userId;
      for (const item of input.items) {
        await tx
          .insert(userNotificationPref)
          .values({
            userId,
            kind: item.kind,
            channel: item.channel,
            enabled: item.enabled,
          })
          .onConflictDoUpdate({
            target: [
              userNotificationPref.userId,
              userNotificationPref.kind,
              userNotificationPref.channel,
            ],
            set: { enabled: item.enabled, updatedAt: new Date() },
          });
      }
      return { ok: true, count: input.items.length };
    }),
});
