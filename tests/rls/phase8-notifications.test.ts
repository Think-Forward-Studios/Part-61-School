/**
 * Phase 8 RLS + behavior tests for notifications + email_outbox.
 *
 * Covers:
 *   - Per-user isolation within a school (user A cannot see user C's rows)
 *   - Cross-tenant isolation (user A cannot see school B's rows)
 *   - Mark-read policy: user A can only update own rows
 *   - email_outbox RLS: authenticated cannot SELECT at all
 *   - notification_default_by_role: readable by anyone authenticated
 *   - User prefs: own-user only (cannot read other users' prefs)
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  asUserOf,
  closeAdmin,
  dbAsAdmin,
  seedTwoSchools,
  type SeedResult,
  SCHOOL_A,
  SCHOOL_B,
  USER_A,
  USER_B,
} from './harness';

// An additional user in school A — for intra-school isolation checks.
const USER_C = 'ccccccc1-cccc-cccc-cccc-ccccccccccc1';

let seed: SeedResult;
let notifA: string;
let notifB: string;
let notifC: string;

beforeAll(async () => {
  seed = await seedTwoSchools();
  const sql = dbAsAdmin();

  await sql.unsafe(`set session_replication_role = replica`);

  // Add USER_C to school A.
  await sql.unsafe(`
    insert into public.users (id, school_id, email, full_name, timezone) values
      ('${USER_C}', '${SCHOOL_A}', 'student-c@alpha.test', 'Alpha Student C', 'America/Chicago')
  `);
  await sql.unsafe(`
    insert into public.user_roles (user_id, role, mechanic_authority, is_default) values
      ('${USER_C}', 'student', 'none', true)
  `);

  // Insert notification rows: one for each of A (school A), B (school B), C (school A).
  const rows = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.notifications
      (school_id, user_id, kind, channel, title, body, severity, is_safety_critical)
    values
      ('${SCHOOL_A}', '${USER_A}', 'reservation_requested', 'in_app', 'A note', 'for A', 'info', false),
      ('${SCHOOL_B}', '${USER_B}', 'reservation_requested', 'in_app', 'B note', 'for B', 'info', false),
      ('${SCHOOL_A}', '${USER_C}', 'reservation_requested', 'in_app', 'C note', 'for C', 'info', false)
    returning id
  `);
  notifA = rows[0]!.id;
  notifB = rows[1]!.id;
  notifC = rows[2]!.id;

  // Seed an email_outbox row (admin-only visibility).
  await sql.unsafe(`
    insert into public.email_outbox
      (school_id, notification_id, to_email, subject, template_key,
       template_props, idempotency_key)
    values
      ('${SCHOOL_A}', '${notifA}', 'admin-a@alpha.test', 'A note',
       'reservation_requested', '{}'::jsonb, '${notifA}:reservation_requested')
  `);

  await sql.unsafe(`set session_replication_role = origin`);
});

afterAll(async () => {
  await closeAdmin();
});

// ---------------------------------------------------------------------
// Group 1: cross-tenant isolation on notifications
// ---------------------------------------------------------------------
describe('phase 8 notifications cross-tenant isolation', () => {
  it('user A cannot see school B notification', async () => {
    const rows = await asUserOf(
      { userId: USER_A, schoolId: SCHOOL_A, activeRole: 'admin' },
      (sql) =>
        sql.unsafe<Array<{ id: string }>>(
          `select id from public.notifications where id = '${notifB}'`,
        ),
    );
    expect(rows).toHaveLength(0);
  });

  it('user B cannot see school A notification', async () => {
    const rows = await asUserOf(
      { userId: USER_B, schoolId: SCHOOL_B, activeRole: 'admin' },
      (sql) =>
        sql.unsafe<Array<{ id: string }>>(
          `select id from public.notifications where id = '${notifA}'`,
        ),
    );
    expect(rows).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------
// Group 2: intra-school per-user isolation
// ---------------------------------------------------------------------
describe('phase 8 notifications per-user isolation within a school', () => {
  it('user A in school A cannot see user C in school A notifications', async () => {
    const rows = await asUserOf(
      { userId: USER_A, schoolId: SCHOOL_A, activeRole: 'admin' },
      (sql) =>
        sql.unsafe<Array<{ id: string }>>(
          `select id from public.notifications where id = '${notifC}'`,
        ),
    );
    expect(rows).toHaveLength(0);
  });

  it('user A sees their own notification', async () => {
    const rows = await asUserOf(
      { userId: USER_A, schoolId: SCHOOL_A, activeRole: 'admin' },
      (sql) =>
        sql.unsafe<Array<{ id: string }>>(
          `select id from public.notifications where id = '${notifA}'`,
        ),
    );
    expect(rows).toHaveLength(1);
  });

  it('user C sees their own notification', async () => {
    const rows = await asUserOf(
      { userId: USER_C, schoolId: SCHOOL_A, activeRole: 'student' },
      (sql) =>
        sql.unsafe<Array<{ id: string }>>(
          `select id from public.notifications where id = '${notifC}'`,
        ),
    );
    expect(rows).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------
// Group 3: update (mark-read) gated to own rows
// ---------------------------------------------------------------------
describe('phase 8 notifications mark-read', () => {
  it('user A can mark own notification read', async () => {
    const rows = await asUserOf(
      { userId: USER_A, schoolId: SCHOOL_A, activeRole: 'admin' },
      (sql) =>
        sql.unsafe<Array<{ id: string; read_at: string | null }>>(
          `update public.notifications
             set read_at = now()
           where id = '${notifA}'
           returning id, read_at`,
        ),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.read_at).not.toBeNull();
  });

  it('user A cannot mark user C notification read', async () => {
    const rows = await asUserOf(
      { userId: USER_A, schoolId: SCHOOL_A, activeRole: 'admin' },
      (sql) =>
        sql.unsafe<Array<{ id: string }>>(
          `update public.notifications set read_at = now() where id = '${notifC}' returning id`,
        ),
    );
    // RLS swallows the row silently — UPDATE returns 0 affected rows.
    expect(rows).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------
// Group 4: email_outbox — authenticated cannot read at all
// ---------------------------------------------------------------------
describe('phase 8 email_outbox hidden from authenticated', () => {
  it('user A (admin) cannot select from email_outbox via RLS', async () => {
    // Even as admin, authenticated role has no grants (revoked) and no
    // permissive policies on this table. Attempting to SELECT should
    // either return 0 rows or raise "permission denied".
    const outcome = await asUserOf(
      { userId: USER_A, schoolId: SCHOOL_A, activeRole: 'admin' },
      async (sql) => {
        try {
          const rows = await sql.unsafe<Array<{ id: string }>>(
            `select id from public.email_outbox`,
          );
          return { ok: true, rows: rows.length };
        } catch (e) {
          return { ok: false, err: (e as Error).message };
        }
      },
    );
    // Accept either: permission denied OR zero rows (RLS without policy).
    if (outcome.ok) {
      expect(outcome.rows).toBe(0);
    } else {
      expect(outcome.err).toMatch(/permission denied|forbidden/i);
    }
  });
});

// ---------------------------------------------------------------------
// Group 5: notification_default_by_role readable; user_notification_pref own-only
// ---------------------------------------------------------------------
describe('phase 8 prefs + defaults visibility', () => {
  it('user A can read notification_default_by_role', async () => {
    const rows = await asUserOf(
      { userId: USER_A, schoolId: SCHOOL_A, activeRole: 'admin' },
      (sql) =>
        sql.unsafe<Array<{ role: string }>>(
          `select role from public.notification_default_by_role limit 5`,
        ),
    );
    expect(rows.length).toBeGreaterThan(0);
  });

  it('user A can set their own notification pref', async () => {
    const rows = await asUserOf(
      { userId: USER_A, schoolId: SCHOOL_A, activeRole: 'admin' },
      (sql) =>
        sql.unsafe<Array<{ user_id: string }>>(
          `insert into public.user_notification_pref (user_id, kind, channel, enabled)
             values ('${USER_A}', 'reservation_approved', 'email', false)
             on conflict (user_id, kind, channel) do update set enabled = excluded.enabled
             returning user_id`,
        ),
    );
    expect(rows).toHaveLength(1);
  });

  it('user A cannot insert a pref for user C', async () => {
    const outcome = await asUserOf(
      { userId: USER_A, schoolId: SCHOOL_A, activeRole: 'admin' },
      async (sql) => {
        try {
          await sql.unsafe(
            `insert into public.user_notification_pref (user_id, kind, channel, enabled)
               values ('${USER_C}', 'reservation_approved', 'email', false)`,
          );
          return { ok: true };
        } catch (e) {
          return { ok: false, err: (e as Error).message };
        }
      },
    );
    expect(outcome.ok).toBe(false);
    expect(outcome.err).toMatch(/row-level security|policy/i);
  });
});
