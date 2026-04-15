/**
 * createNotification — the single entry point every Phase 8 mutation
 * calls to fan out an event into the notifications + email_outbox
 * pipeline.
 *
 * Contract (Plan 08-01 Task 2):
 *
 *   1. Called from inside a Drizzle transaction opened by
 *      `withTenantTx` so the INSERTs are atomic with the caller's
 *      business mutation. If the outer tx rolls back, the notification
 *      row + outbox row also roll back.
 *
 *   2. Computes effective prefs via SQL that LEFT JOINs
 *      `user_notification_pref` onto `notification_default_by_role`
 *      using the user's active_role. The SQL returns one row per
 *      (channel, enabled) pair.
 *
 *   3. Safety-critical rules:
 *      • is_safety_critical = true  → in_app ALWAYS delivered even if
 *        the user has in_app off.
 *      • Email STILL respects the user pref per CONTEXT literal reading
 *        + RESEARCH Q6. If a partner school wants safety-critical to
 *        force email, change this helper — it's the single choke point.
 *
 *   4. Email is queued only when BOTH:
 *      • emailTemplateKey is provided by the caller, AND
 *      • effective email pref is enabled (or user has no pref row but
 *        the role default is enabled).
 *
 *   5. Idempotency key = `${notificationId}:${kind}`. The outbox has a
 *      unique index on idempotency_key; ON CONFLICT DO NOTHING makes
 *      this helper safe to call from retrying code paths.
 *
 *   6. Errors are NOT swallowed. If any SQL fails (FK violation, RLS
 *      rejection, constraint miss), the error propagates and the outer
 *      tRPC transaction rolls back.
 */
import { sql } from 'drizzle-orm';

export type NotificationEventKind =
  | 'reservation_requested'
  | 'reservation_approved'
  | 'reservation_changed'
  | 'reservation_cancelled'
  | 'reservation_reminder_24h'
  | 'grading_complete'
  | 'squawk_opened'
  | 'squawk_grounding'
  | 'squawk_returned_to_service'
  | 'document_expiring'
  | 'currency_expiring'
  | 'overdue_aircraft'
  | 'grounded_aircraft_attempted_use'
  | 'admin_broadcast'
  | 'duty_hour_warning';

export type NotificationChannel = 'in_app' | 'email' | 'dispatch';

export type NotificationSeverity = 'info' | 'warn' | 'critical';

/**
 * Minimal structural type so this helper works with both the top-level
 * Drizzle db and a transaction handle — matches `ExecutorLike` in
 * packages/db/src/tx.ts.
 */
export interface NotificationTx {
  execute: (query: ReturnType<typeof sql>) => Promise<unknown>;
}

export interface CreateNotificationOpts {
  schoolId: string;
  userId: string;
  kind: NotificationEventKind;
  title: string;
  body: string;
  /**
   * The user's active role — used to look up defaults when the user
   * has no row in user_notification_pref. If omitted, the helper falls
   * back to `current_setting('app.active_role', true)` which
   * `withTenantTx` sets at transaction start.
   */
  activeRole?: string;
  linkUrl?: string;
  sourceTable?: string;
  sourceRecordId?: string;
  severity?: NotificationSeverity;
  isSafetyCritical?: boolean;
  emailTemplateKey?: string;
  emailTemplateProps?: Record<string, unknown>;
  baseId?: string | null;
  /**
   * Also publish a dispatch-channel row for MSG-04. Defaults to false.
   * Does not respect user prefs — dispatch is a shared screen.
   */
  alsoDispatch?: boolean;
}

export interface CreateNotificationResult {
  notificationId: string | null;
  emailQueued: boolean;
}

/**
 * Row shape returned by the effective-prefs lookup.
 */
interface PrefRow {
  channel: NotificationChannel;
  enabled: boolean;
}

/**
 * Row shape returned by the user-email lookup.
 */
interface UserEmailRow {
  email: string | null;
}

export async function createNotification(
  tx: NotificationTx,
  opts: CreateNotificationOpts,
): Promise<CreateNotificationResult> {
  // ---------------------------------------------------------------
  // 1. Resolve effective prefs (user override OR role default)
  // ---------------------------------------------------------------
  // For each channel, prefer the user_notification_pref row if present;
  // otherwise fall back to notification_default_by_role for the caller's
  // active_role. UNION ALL is the simplest "pref per channel" shape.
  const activeRoleExpr = opts.activeRole
    ? sql`${opts.activeRole}::text`
    : sql`current_setting('app.active_role', true)`;

  const prefsResult = (await tx.execute(sql`
    with effective as (
      select
        c::public.notification_channel as channel,
        coalesce(
          (select enabled from public.user_notification_pref
            where user_id = ${opts.userId}::uuid
              and kind    = ${opts.kind}::public.notification_event_kind
              and channel = c::public.notification_channel
           limit 1),
          (select enabled from public.notification_default_by_role
            where role    = ${activeRoleExpr}
              and kind    = ${opts.kind}::public.notification_event_kind
              and channel = c::public.notification_channel
           limit 1),
          false
        ) as enabled
      from unnest(array['in_app','email']::text[]) as c
    )
    select channel::text as channel, enabled
      from effective
  `)) as unknown as PrefRow[];

  const prefByChannel = new Map<NotificationChannel, boolean>();
  for (const row of prefsResult) {
    prefByChannel.set(row.channel, !!row.enabled);
  }

  const inAppEnabled = !!opts.isSafetyCritical || prefByChannel.get('in_app') === true;
  const emailEnabled = prefByChannel.get('email') === true && !!opts.emailTemplateKey;

  // ---------------------------------------------------------------
  // 2. Insert in-app row if enabled
  // ---------------------------------------------------------------
  let notificationId: string | null = null;
  if (inAppEnabled) {
    const inserted = (await tx.execute(sql`
      insert into public.notifications
        (school_id, base_id, user_id, kind, channel, title, body, link_url,
         source_table, source_record_id, severity, is_safety_critical)
      values (
        ${opts.schoolId}::uuid,
        ${opts.baseId ?? null}::uuid,
        ${opts.userId}::uuid,
        ${opts.kind}::public.notification_event_kind,
        'in_app'::public.notification_channel,
        ${opts.title},
        ${opts.body},
        ${opts.linkUrl ?? null},
        ${opts.sourceTable ?? null},
        ${opts.sourceRecordId ?? null}::uuid,
        ${opts.severity ?? 'info'},
        ${opts.isSafetyCritical ?? false}
      )
      returning id
    `)) as unknown as Array<{ id: string }>;
    notificationId = inserted[0]?.id ?? null;
  }

  // ---------------------------------------------------------------
  // 3. Dispatch-channel row (MSG-04) — does not respect user pref
  // ---------------------------------------------------------------
  if (opts.alsoDispatch) {
    await tx.execute(sql`
      insert into public.notifications
        (school_id, base_id, user_id, kind, channel, title, body, link_url,
         source_table, source_record_id, severity, is_safety_critical)
      values (
        ${opts.schoolId}::uuid,
        ${opts.baseId ?? null}::uuid,
        ${opts.userId}::uuid,
        ${opts.kind}::public.notification_event_kind,
        'dispatch'::public.notification_channel,
        ${opts.title},
        ${opts.body},
        ${opts.linkUrl ?? null},
        ${opts.sourceTable ?? null},
        ${opts.sourceRecordId ?? null}::uuid,
        ${opts.severity ?? 'critical'},
        true
      )
    `);
  }

  // ---------------------------------------------------------------
  // 4. Queue email if enabled and template key supplied
  // ---------------------------------------------------------------
  let emailQueued = false;
  if (emailEnabled && notificationId && opts.emailTemplateKey) {
    const userRow = (await tx.execute(sql`
      select email from public.users where id = ${opts.userId}::uuid
    `)) as unknown as UserEmailRow[];
    const toEmail = userRow[0]?.email;
    if (toEmail) {
      await tx.execute(sql`
        insert into public.email_outbox
          (school_id, notification_id, to_email, subject, template_key,
           template_props, idempotency_key)
        values (
          ${opts.schoolId}::uuid,
          ${notificationId}::uuid,
          ${toEmail},
          ${opts.title},
          ${opts.emailTemplateKey},
          ${JSON.stringify(opts.emailTemplateProps ?? {})}::jsonb,
          ${notificationId + ':' + opts.kind}
        )
        on conflict (idempotency_key) do nothing
      `);
      emailQueued = true;
    }
  }

  return { notificationId, emailQueued };
}
