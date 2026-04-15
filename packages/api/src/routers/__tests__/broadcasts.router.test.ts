/**
 * Integration tests for broadcasts.create/listActive/acknowledge.
 *
 * Seeds 1 admin + 2 students in the same school, invokes create, then
 * verifies the broadcast row + per-recipient notification rows land in
 * one transaction. Non-admin callers are rejected by adminProcedure.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import postgres from 'postgres';

import { appRouter } from '../_root';
import type { Session } from '../../session';

const URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const SCHOOL = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const ADMIN_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb11';
const STUDENT1_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb22';
const STUDENT2_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb33';
const BASE_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb44';

let admin: ReturnType<typeof postgres>;

async function seed() {
  await admin.unsafe(`set session_replication_role = replica`);
  await admin.unsafe(`
    delete from public.broadcast_read where user_id in
      ('${ADMIN_ID}', '${STUDENT1_ID}', '${STUDENT2_ID}')
  `);
  await admin.unsafe(`delete from public.broadcast where school_id = '${SCHOOL}'`);
  await admin.unsafe(`
    delete from public.notifications where user_id in
      ('${ADMIN_ID}', '${STUDENT1_ID}', '${STUDENT2_ID}')
  `);
  await admin.unsafe(`delete from public.email_outbox where school_id = '${SCHOOL}'`);
  await admin.unsafe(`
    delete from public.user_roles where user_id in
      ('${ADMIN_ID}', '${STUDENT1_ID}', '${STUDENT2_ID}')
  `);
  await admin.unsafe(`
    delete from public.users where id in
      ('${ADMIN_ID}', '${STUDENT1_ID}', '${STUDENT2_ID}')
  `);
  await admin.unsafe(`delete from public.bases where id = '${BASE_ID}'`);
  await admin.unsafe(`delete from public.schools where id = '${SCHOOL}'`);

  await admin.unsafe(`
    insert into public.schools (id, name, timezone)
    values ('${SCHOOL}', 'Broadcast Test School', 'UTC')
  `);
  await admin.unsafe(`
    insert into public.bases (id, school_id, name, timezone)
    values ('${BASE_ID}', '${SCHOOL}', 'Main', 'UTC')
  `);
  await admin.unsafe(`
    insert into public.users (id, school_id, email, full_name, timezone) values
      ('${ADMIN_ID}',    '${SCHOOL}', 'admin@alpha.test',    'Admin',   'UTC'),
      ('${STUDENT1_ID}', '${SCHOOL}', 'student1@alpha.test', 'Student 1','UTC'),
      ('${STUDENT2_ID}', '${SCHOOL}', 'student2@alpha.test', 'Student 2','UTC')
  `);
  await admin.unsafe(`
    insert into public.user_roles (user_id, role, mechanic_authority, is_default) values
      ('${ADMIN_ID}',    'admin',   'none', true),
      ('${STUDENT1_ID}', 'student', 'none', true),
      ('${STUDENT2_ID}', 'student', 'none', true)
  `);

  await admin.unsafe(`set session_replication_role = origin`);
}

function session(userId: string, role: Session['activeRole']): Session {
  return {
    userId,
    schoolId: SCHOOL,
    email: `${userId}@test`,
    roles: [role],
    activeRole: role,
    activeBaseId: BASE_ID,
  };
}

function caller(userId: string, role: Session['activeRole']) {
  return appRouter.createCaller({
    session: session(userId, role),
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

describe('broadcasts.create', () => {
  it('non-admin caller is rejected', async () => {
    const me = caller(STUDENT1_ID, 'student');
    await expect(
      me.broadcasts.create({
        targetRoles: ['student'],
        title: 'x',
        body: 'y',
      }),
    ).rejects.toThrow(/admin/i);
  });

  it('admin create fans out to both students and writes notification rows', async () => {
    const me = caller(ADMIN_ID, 'admin');
    const result = await me.broadcasts.create({
      targetRoles: ['student'],
      title: 'Ground school moves to 10am',
      body: 'Updated weather briefing time',
      urgency: 'normal',
    });
    expect(result.broadcast).toBeTruthy();
    expect(result.fanoutCount).toBe(2);

    const rows = await admin.unsafe<Array<{ count: string }>>(`
      select count(*)::text as count
        from public.notifications
       where source_table = 'broadcast'
         and source_record_id = '${(result.broadcast as { id: string }).id}'
    `);
    // Students get admin_broadcast in-app notifications.
    expect(Number(rows[0]!.count)).toBeGreaterThanOrEqual(2);
  });
});

describe('broadcasts.listActive + acknowledge', () => {
  it('student sees broadcast until acknowledged', async () => {
    const adminCaller = caller(ADMIN_ID, 'admin');
    const createResult = await adminCaller.broadcasts.create({
      targetRoles: ['student'],
      title: 'Banner test',
      body: 'Banner body',
    });
    const broadcastId = (createResult.broadcast as { id: string }).id;

    const student = caller(STUDENT1_ID, 'student');
    const beforeAck = await student.broadcasts.listActive();
    expect(beforeAck.some((b) => (b as { id: string }).id === broadcastId)).toBe(true);

    await student.broadcasts.acknowledge({ broadcastId });

    const afterAck = await student.broadcasts.listActive();
    expect(afterAck.some((b) => (b as { id: string }).id === broadcastId)).toBe(false);
  });
});
