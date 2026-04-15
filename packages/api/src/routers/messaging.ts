/**
 * messaging router (Plan 08-01 Task 3).
 *
 * Procedures:
 *   - conversations.list            — conversations for current user
 *   - conversations.open({otherUserId}) — upsert canonical pair
 *   - thread.list({conversationId, cursor?}) — paginated messages desc
 *   - thread.send({conversationId, body}) — insert message, bump lastMessageAt
 *   - thread.markRead({conversationId})  — upsert message_read watermark
 *
 * Design choice: we do NOT fire createNotification() on each message.
 * Realtime subscription on `message` rows drives both delivery and
 * unread badges — avoids doubling the write path. If email-on-DM is
 * requested later, add a new notification kind and call createNotification
 * from `thread.send`.
 *
 * Participant-only is enforced by RLS (conversation_select_participant +
 * message_select_participant). We add an early router-level check to
 * return a friendlier error than an empty list.
 */
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { and, desc, eq, lt, or, sql } from 'drizzle-orm';
import { conversation, message, messageRead, users } from '@part61/db';

import { router } from '../trpc';
import { protectedProcedure } from '../procedures';

type Tx = {
  insert: typeof import('@part61/db').db.insert;
  select: typeof import('@part61/db').db.select;
  update: typeof import('@part61/db').db.update;
  execute: (q: ReturnType<typeof sql>) => Promise<unknown>;
};

// Lenient UUID pattern — zod 4's strict uuid() rejects test/fixture UUIDs
// that don't set the variant nibble. Matches existing 07-01 precedent in
// packages/api/src/routers/admin/geofence.ts.
const uuidString = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'Invalid UUID format');

function orderedPair(a: string, b: string): { low: string; high: string } {
  return a < b ? { low: a, high: b } : { low: b, high: a };
}

const conversationsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const tx = ctx.tx as Tx;
    const userId = ctx.session!.userId;
    const rows = await tx
      .select()
      .from(conversation)
      .where(or(eq(conversation.userALow, userId), eq(conversation.userBHigh, userId)))
      .orderBy(desc(conversation.lastMessageAt));
    return rows;
  }),

  open: protectedProcedure
    .input(z.object({ otherUserId: uuidString }))
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const me = ctx.session!.userId;
      if (me === input.otherUserId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot start a conversation with yourself',
        });
      }
      // Verify other user is in the same school (defense-in-depth —
      // RLS on users already gates cross-tenant reads, but we want a
      // crisp 404 rather than a foreign-key failure on insert).
      const other = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, input.otherUserId))
        .limit(1);
      if (!other[0]) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Recipient not found',
        });
      }

      const { low, high } = orderedPair(me, input.otherUserId);

      // Upsert the canonical pair.
      const inserted = (await tx.execute(sql`
        insert into public.conversation (school_id, user_a_low, user_b_high)
        values (${ctx.session!.schoolId}::uuid, ${low}::uuid, ${high}::uuid)
        on conflict (school_id, user_a_low, user_b_high)
          do update set last_message_at = public.conversation.last_message_at
        returning id, school_id, user_a_low, user_b_high, last_message_at, created_at
      `)) as unknown as Array<Record<string, unknown>>;
      return inserted[0] ?? null;
    }),
});

const threadRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        conversationId: uuidString,
        cursor: z.string().datetime().optional(),
        limit: z.number().int().min(1).max(100).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      // Participant check (also enforced by RLS).
      const convRows = await tx
        .select()
        .from(conversation)
        .where(eq(conversation.id, input.conversationId))
        .limit(1);
      const conv = convRows[0];
      if (!conv) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Conversation not found' });
      }
      const me = ctx.session!.userId;
      if (conv.userALow !== me && conv.userBHigh !== me) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Not a participant' });
      }
      const cursorDate = input.cursor ? new Date(input.cursor) : null;
      const limit = input.limit ?? 50;
      const rows = cursorDate
        ? await tx
            .select()
            .from(message)
            .where(
              and(eq(message.conversationId, input.conversationId), lt(message.sentAt, cursorDate)),
            )
            .orderBy(desc(message.sentAt))
            .limit(limit)
        : await tx
            .select()
            .from(message)
            .where(eq(message.conversationId, input.conversationId))
            .orderBy(desc(message.sentAt))
            .limit(limit);
      return rows;
    }),

  send: protectedProcedure
    .input(
      z.object({
        conversationId: uuidString,
        body: z.string().min(1).max(4000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const convRows = await tx
        .select()
        .from(conversation)
        .where(eq(conversation.id, input.conversationId))
        .limit(1);
      const conv = convRows[0];
      if (!conv) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Conversation not found' });
      }
      const me = ctx.session!.userId;
      if (conv.userALow !== me && conv.userBHigh !== me) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Not a participant' });
      }
      const now = new Date();
      const [row] = await tx
        .insert(message)
        .values({
          conversationId: conv.id,
          schoolId: conv.schoolId,
          senderId: me,
          body: input.body,
          sentAt: now,
        })
        .returning();
      await tx.update(conversation).set({ lastMessageAt: now }).where(eq(conversation.id, conv.id));
      return row!;
    }),

  markRead: protectedProcedure
    .input(z.object({ conversationId: uuidString }))
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const me = ctx.session!.userId;
      await tx
        .insert(messageRead)
        .values({
          conversationId: input.conversationId,
          userId: me,
          lastReadAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [messageRead.conversationId, messageRead.userId],
          set: { lastReadAt: new Date() },
        });
      return { ok: true };
    }),
});

export const messagingRouter = router({
  conversations: conversationsRouter,
  thread: threadRouter,
});
