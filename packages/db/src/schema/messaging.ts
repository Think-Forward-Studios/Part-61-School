/**
 * Phase 8: Messaging (MSG-01, MSG-02).
 *
 * 1:1 conversation between two users, identified by a canonical pair
 * key (user_a_low = LEAST(u1, u2), user_b_high = GREATEST(u1, u2)) so
 * upsert is deterministic regardless of which direction the thread
 * was opened from.
 *
 * Broadcasts (MSG-02) are a separate table — admin-originated, fan out
 * per-role in the same transaction that creates the broadcast. Per-user
 * dismissal is tracked via `broadcast_read`.
 *
 * RLS: `conversation` + `message` are participant-only. `broadcast` is
 * readable by any authenticated user in the school; INSERT is gated at
 * the tRPC layer via `adminProcedure` (RLS only enforces school_id).
 */
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  pgPolicy,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { bases, schools } from './tenancy';
import { users } from './users';

// ---------------------------------------------------------------------------
// conversation — 1:1 pair
// ---------------------------------------------------------------------------
export const conversation = pgTable(
  'conversation',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id),
    userALow: uuid('user_a_low')
      .notNull()
      .references(() => users.id),
    userBHigh: uuid('user_b_high')
      .notNull()
      .references(() => users.id),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('conversation_ordered_pair_chk', sql`user_a_low < user_b_high`),
    uniqueIndex('conversation_pair_uq').on(t.schoolId, t.userALow, t.userBHigh),
    index('conversation_last_message_idx').on(t.schoolId, t.lastMessageAt),
    pgPolicy('conversation_select_participant', {
      as: 'permissive',
      for: 'select',
      to: 'authenticated',
      using: sql`(user_a_low = auth.uid() or user_b_high = auth.uid())
                 and school_id = (auth.jwt() ->> 'school_id')::uuid`,
    }),
    pgPolicy('conversation_insert_participant', {
      as: 'permissive',
      for: 'insert',
      to: 'authenticated',
      withCheck: sql`(user_a_low = auth.uid() or user_b_high = auth.uid())
                     and school_id = (auth.jwt() ->> 'school_id')::uuid`,
    }),
    pgPolicy('conversation_update_participant', {
      as: 'permissive',
      for: 'update',
      to: 'authenticated',
      using: sql`(user_a_low = auth.uid() or user_b_high = auth.uid())
                 and school_id = (auth.jwt() ->> 'school_id')::uuid`,
      withCheck: sql`(user_a_low = auth.uid() or user_b_high = auth.uid())
                     and school_id = (auth.jwt() ->> 'school_id')::uuid`,
    }),
  ],
);

// ---------------------------------------------------------------------------
// message — one row per IM. Safety-relevant: soft-delete only.
// ---------------------------------------------------------------------------
export const message = pgTable(
  'message',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversation.id),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id),
    senderId: uuid('sender_id')
      .notNull()
      .references(() => users.id),
    body: text('body').notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('message_conversation_sent_idx').on(t.conversationId, t.sentAt),
    pgPolicy('message_select_participant', {
      as: 'permissive',
      for: 'select',
      to: 'authenticated',
      using: sql`conversation_id in (
        select id from public.conversation
         where user_a_low = auth.uid() or user_b_high = auth.uid()
      )`,
    }),
    pgPolicy('message_insert_sender', {
      as: 'permissive',
      for: 'insert',
      to: 'authenticated',
      withCheck: sql`sender_id = auth.uid() and conversation_id in (
        select id from public.conversation
         where user_a_low = auth.uid() or user_b_high = auth.uid()
      )`,
    }),
  ],
);

// ---------------------------------------------------------------------------
// message_read — per-user watermark of last-read time
// ---------------------------------------------------------------------------
export const messageRead = pgTable(
  'message_read',
  {
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversation.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    lastReadAt: timestamp('last_read_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.conversationId, t.userId] }),
    pgPolicy('message_read_own', {
      as: 'permissive',
      for: 'all',
      to: 'authenticated',
      using: sql`user_id = auth.uid()`,
      withCheck: sql`user_id = auth.uid()`,
    }),
  ],
);

// ---------------------------------------------------------------------------
// broadcast — admin-originated school-wide announcement (MSG-02)
// ---------------------------------------------------------------------------
export const broadcast = pgTable(
  'broadcast',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id),
    baseId: uuid('base_id').references(() => bases.id),
    senderId: uuid('sender_id')
      .notNull()
      .references(() => users.id),
    targetRoles: text('target_roles').array().notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    urgency: text('urgency').notNull().default('normal'), // normal | urgent
    isRecalled: boolean('is_recalled').notNull().default(false),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('broadcast_school_sent_idx').on(t.schoolId, t.sentAt),
    pgPolicy('broadcast_select_own_school', {
      as: 'permissive',
      for: 'select',
      to: 'authenticated',
      using: sql`school_id = (auth.jwt() ->> 'school_id')::uuid`,
    }),
    // INSERT/UPDATE gated at tRPC via adminProcedure; RLS only scopes
    // by school so defense-in-depth still catches cross-tenant writes.
    pgPolicy('broadcast_admin_write', {
      as: 'permissive',
      for: 'all',
      to: 'authenticated',
      using: sql`school_id = (auth.jwt() ->> 'school_id')::uuid
                 and (auth.jwt() ->> 'active_role') = 'admin'`,
      withCheck: sql`school_id = (auth.jwt() ->> 'school_id')::uuid
                     and (auth.jwt() ->> 'active_role') = 'admin'`,
    }),
  ],
);

// ---------------------------------------------------------------------------
// broadcast_read — per-recipient dismissal watermark
// ---------------------------------------------------------------------------
export const broadcastRead = pgTable(
  'broadcast_read',
  {
    broadcastId: uuid('broadcast_id')
      .notNull()
      .references(() => broadcast.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    dismissedAt: timestamp('dismissed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.broadcastId, t.userId] }),
    pgPolicy('broadcast_read_own', {
      as: 'permissive',
      for: 'all',
      to: 'authenticated',
      using: sql`user_id = auth.uid()`,
      withCheck: sql`user_id = auth.uid()`,
    }),
  ],
);

export type Conversation = typeof conversation.$inferSelect;
export type NewConversation = typeof conversation.$inferInsert;
export type Message = typeof message.$inferSelect;
export type NewMessage = typeof message.$inferInsert;
export type MessageRead = typeof messageRead.$inferSelect;
export type NewMessageRead = typeof messageRead.$inferInsert;
export type Broadcast = typeof broadcast.$inferSelect;
export type NewBroadcast = typeof broadcast.$inferInsert;
export type BroadcastRead = typeof broadcastRead.$inferSelect;
export type NewBroadcastRead = typeof broadcastRead.$inferInsert;
