/**
 * Integration tests for the notifications router against a real local
 * Postgres. We seed one user + school via the admin harness, then
 * exercise each procedure through the tRPC caller so the full
 * `withTenantTx` middleware chain runs.
 *
 * The local db exposes a superuser connection at
 *   postgresql://postgres:postgres@127.0.0.1:54322/postgres
 * (see tests/rls/harness.ts). vitest.config.ts in this package points
 * DATABASE_URL/DIRECT_DATABASE_URL at it.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import postgres from 'postgres';

import { appRouter } from '../_root';
import type { Session } from '../../session';

const URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const SCHOOL = '88888888-8888-8888-8888-888888888888';
const USER_ID = '88888888-8888-8888-8888-888888888811';
const BASE_ID = '88888888-8888-8888-8888-888888888822';

let admin: ReturnType<typeof postgres>;

async function seed() {
  await admin.unsafe(`set session_replication_role = replica`);
  await admin.unsafe(`delete from public.user_notification_pref where user_id = '${USER_ID}'`);
  await admin.unsafe(`delete from public.notifications where user_id = '${USER_ID}'`);
  await admin.unsafe(`delete from public.user_roles where user_id = '${USER_ID}'`);
  await admin.unsafe(`delete from public.users where id = '${USER_ID}'`);
  await admin.unsafe(`delete from public.bases where id = '${BASE_ID}'`);
  await admin.unsafe(`delete from public.schools where id = '${SCHOOL}'`);

  await admin.unsafe(`
    insert into public.schools (id, name, timezone)
    values ('${SCHOOL}', 'Notif Test School', 'UTC')
  `);
  await admin.unsafe(`
    insert into public.bases (id, school_id, name, timezone)
    values ('${BASE_ID}', '${SCHOOL}', 'Main', 'UTC')
  `);
  await admin.unsafe(`
    insert into public.users (id, school_id, email, full_name, timezone)
    values ('${USER_ID}', '${SCHOOL}', 'notif-test@alpha.test', 'Notif Tester', 'UTC')
  `);
  await admin.unsafe(`
    insert into public.user_roles (user_id, role, mechanic_authority, is_default)
    values ('${USER_ID}', 'admin', 'none', true)
  `);

  // Seed 3 notifications for the user.
  await admin.unsafe(`
    insert into public.notifications (school_id, user_id, kind, channel, title, body)
    values
      ('${SCHOOL}', '${USER_ID}', 'reservation_approved', 'in_app', 'A', 'a'),
      ('${SCHOOL}', '${USER_ID}', 'reservation_approved', 'in_app', 'B', 'b'),
      ('${SCHOOL}', '${USER_ID}', 'reservation_approved', 'in_app', 'C', 'c')
  `);

  await admin.unsafe(`set session_replication_role = origin`);
}

function makeSession(): Session {
  return {
    userId: USER_ID,
    schoolId: SCHOOL,
    email: 'notif-test@alpha.test',
    roles: ['admin'],
    activeRole: 'admin',
    activeBaseId: BASE_ID,
  };
}

function makeCaller() {
  return appRouter.createCaller({
    session: makeSession(),
    supabase: {},
  } as never);
}

beforeAll(async () => {
  admin = postgres(URL, { prepare: false, max: 2, onnotice: () => {} });
});

afterAll(async () => {
  await admin.end({ timeout: 5 });
});

beforeEach(async () => {
  await seed();
});

describe('notifications.list + unreadCount', () => {
  it('list returns seeded notifications for the user', async () => {
    const caller = makeCaller();
    const rows = await caller.notifications.list();
    expect(rows.length).toBeGreaterThanOrEqual(3);
  });

  it('unreadCount returns 3 initially', async () => {
    const caller = makeCaller();
    const count = await caller.notifications.unreadCount();
    expect(count).toBeGreaterThanOrEqual(3);
  });
});

describe('notifications.markRead + markAllRead', () => {
  it('markAllRead moves unread count to 0', async () => {
    const caller = makeCaller();
    const before = await caller.notifications.unreadCount();
    expect(before).toBeGreaterThanOrEqual(3);

    const marked = await caller.notifications.markAllRead();
    expect(marked.markedCount).toBeGreaterThanOrEqual(3);

    const after = await caller.notifications.unreadCount();
    expect(after).toBe(0);
  });

  it('markRead only marks the specified row', async () => {
    const caller = makeCaller();
    const rows = await caller.notifications.list({ onlyUnread: true });
    expect(rows.length).toBeGreaterThanOrEqual(3);
    const first = rows[0]!;
    const updated = await caller.notifications.markRead({ id: first.id });
    expect(updated?.id).toBe(first.id);
    expect(updated?.readAt).toBeTruthy();

    const remaining = await caller.notifications.unreadCount();
    expect(remaining).toBe(rows.length - 1);
  });
});

describe('notifications.listPrefs + updatePref', () => {
  it('listPrefs returns role-default matrix when user has no overrides', async () => {
    const caller = makeCaller();
    const prefs = await caller.notifications.listPrefs();
    expect(prefs.length).toBeGreaterThan(0);
    // Admin role has at least reservation_approved defaults seeded.
    const approvedInApp = prefs.find(
      (p) => p.kind === 'reservation_approved' && p.channel === 'in_app',
    );
    expect(approvedInApp?.enabled).toBe(true);
    expect(approvedInApp?.has_user_override).toBe(false);
  });

  it('updatePref upserts and listPrefs reflects the override', async () => {
    const caller = makeCaller();
    await caller.notifications.updatePref({
      kind: 'reservation_approved',
      channel: 'email',
      enabled: false,
    });
    const prefs = await caller.notifications.listPrefs();
    const emailPref = prefs.find((p) => p.kind === 'reservation_approved' && p.channel === 'email');
    expect(emailPref?.enabled).toBe(false);
    expect(emailPref?.has_user_override).toBe(true);
  });
});
