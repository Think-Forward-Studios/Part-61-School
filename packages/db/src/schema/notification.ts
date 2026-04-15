/**
 * Phase 8: Notifications + email outbox (SCH-10, NOT-01, NOT-02).
 *
 * Drizzle type inference only — the SOURCE OF TRUTH for schema, RLS,
 * and realtime publication registration is the hand-authored SQL
 * migration `0032_phase8_notifications.sql`. Per the Phase 2+
 * convention (see STATE decision "hand-authored SQL vs Drizzle Kit"),
 * this file mirrors the SQL so `tx.insert(notifications).values({...})`
 * still gives type-checked call sites.
 *
 * Transactional outbox pattern: mutations call createNotification(tx, opts)
 * which inserts a `notifications` row AND (if email enabled for the
 * recipient) an `email_outbox` row inside the caller's transaction.
 * A separate worker at /api/emails/send drains `email_outbox` via
 * FOR UPDATE SKIP LOCKED, calls Resend, and marks rows sent/failed.
 */
import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
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
// Enums
// ---------------------------------------------------------------------------

/**
 * All event kinds Phase 8 + downstream plans emit. Add a new kind by
 * extending this enum in a dedicated migration — do not reuse kinds for
 * unrelated events because per-kind prefs + role-based defaults depend
 * on the kind identity.
 */
export const notificationEventKindEnum = pgEnum('notification_event_kind', [
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
]);

/**
 * Delivery channels. `in_app` is the notification bell; `email` is the
 * Resend-delivered transactional email; `dispatch` is the dispatch
 * screen cue (silent flash + toast) from MSG-04.
 */
export const notificationChannelEnum = pgEnum('notification_channel', [
  'in_app',
  'email',
  'dispatch',
]);

// ---------------------------------------------------------------------------
// notifications — one row per (user, channel) per event
// ---------------------------------------------------------------------------
export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id),
    baseId: uuid('base_id').references(() => bases.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    kind: notificationEventKindEnum('kind').notNull(),
    channel: notificationChannelEnum('channel').notNull().default('in_app'),
    title: text('title').notNull(),
    body: text('body').notNull(),
    linkUrl: text('link_url'),
    sourceTable: text('source_table'),
    sourceRecordId: uuid('source_record_id'),
    severity: text('severity').notNull().default('info'), // info | warn | critical
    isSafetyCritical: boolean('is_safety_critical').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    readAt: timestamp('read_at', { withTimezone: true }),
    dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
  },
  (t) => [
    index('notifications_user_unread_idx')
      .on(t.userId, t.createdAt)
      .where(sql`read_at is null`),
    index('notifications_school_created_idx').on(t.schoolId, t.createdAt),
    index('notifications_source_idx').on(t.sourceTable, t.sourceRecordId),
    pgPolicy('notifications_select_own', {
      as: 'permissive',
      for: 'select',
      to: 'authenticated',
      using: sql`user_id = auth.uid() and school_id = (auth.jwt() ->> 'school_id')::uuid`,
    }),
    pgPolicy('notifications_insert_own_school', {
      as: 'permissive',
      for: 'insert',
      to: 'authenticated',
      withCheck: sql`school_id = (auth.jwt() ->> 'school_id')::uuid`,
    }),
    pgPolicy('notifications_update_own', {
      as: 'permissive',
      for: 'update',
      to: 'authenticated',
      using: sql`user_id = auth.uid()`,
      withCheck: sql`user_id = auth.uid()`,
    }),
  ],
);

// ---------------------------------------------------------------------------
// user_notification_pref — per-user override of role defaults
// ---------------------------------------------------------------------------
export const userNotificationPref = pgTable(
  'user_notification_pref',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    kind: notificationEventKindEnum('kind').notNull(),
    channel: notificationChannelEnum('channel').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.kind, t.channel] }),
    index('user_notification_pref_user_idx').on(t.userId),
    pgPolicy('user_notification_pref_own', {
      as: 'permissive',
      for: 'all',
      to: 'authenticated',
      using: sql`user_id = auth.uid()`,
      withCheck: sql`user_id = auth.uid()`,
    }),
  ],
);

// ---------------------------------------------------------------------------
// notification_default_by_role — seeded role-curated defaults
// ---------------------------------------------------------------------------
export const notificationDefaultByRole = pgTable(
  'notification_default_by_role',
  {
    role: text('role').notNull(),
    kind: notificationEventKindEnum('kind').notNull(),
    channel: notificationChannelEnum('channel').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    isSafetyCritical: boolean('is_safety_critical').notNull().default(false),
  },
  (t) => [
    primaryKey({ columns: [t.role, t.kind, t.channel] }),
    // Readable by any authenticated user — prefs are not sensitive
    pgPolicy('notification_default_by_role_select_all', {
      as: 'permissive',
      for: 'select',
      to: 'authenticated',
      using: sql`true`,
    }),
  ],
);

// ---------------------------------------------------------------------------
// email_outbox — transactional-outbox queue drained by /api/emails/send
// ---------------------------------------------------------------------------
/**
 * email_outbox is NOT exposed to `authenticated` in RLS — only the
 * service-role worker route reads/writes. The migration revokes
 * grants from authenticated/anon and enables RLS with no permissive
 * policies, so any direct client SELECT returns zero rows.
 */
export const emailOutbox = pgTable(
  'email_outbox',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id),
    notificationId: uuid('notification_id').references(() => notifications.id),
    toEmail: text('to_email').notNull(),
    subject: text('subject').notNull(),
    templateKey: text('template_key').notNull(),
    templateProps: jsonb('template_props').notNull(),
    idempotencyKey: text('idempotency_key').notNull().unique(),
    status: text('status').notNull().default('pending'), // pending | sending | sent | failed
    sentAt: timestamp('sent_at', { withTimezone: true }),
    failedAt: timestamp('failed_at', { withTimezone: true }),
    errorMessage: text('error_message'),
    attempts: integer('attempts').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('email_outbox_status_created_idx').on(t.status, t.createdAt),
    uniqueIndex('email_outbox_idempotency_uq').on(t.idempotencyKey),
  ],
);

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
export type UserNotificationPref = typeof userNotificationPref.$inferSelect;
export type NewUserNotificationPref = typeof userNotificationPref.$inferInsert;
export type NotificationDefaultByRole = typeof notificationDefaultByRole.$inferSelect;
export type NewNotificationDefaultByRole = typeof notificationDefaultByRole.$inferInsert;
export type EmailOutbox = typeof emailOutbox.$inferSelect;
export type NewEmailOutbox = typeof emailOutbox.$inferInsert;
