/**
 * Phase 8 RLS tests for messaging (conversation + message + broadcast).
 *
 * Covers:
 *   - Participant-only conversation visibility
 *   - Participant-only message insert + select
 *   - Non-participant (user C) cannot see or write into the thread
 *   - Broadcast admin-write RLS (non-admin cannot insert)
 *   - Cross-tenant: school B users can't see school A broadcasts
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

const USER_C = 'ccccccc1-cccc-cccc-cccc-ccccccccccc1';
// Second user in school A (we set up conversation between A and C).
// We need IDs where USER_A < USER_C lexicographically so the canonical
// pair (user_a_low < user_b_high) check passes deterministically.
// USER_A starts with 'aaa' and USER_C starts with 'ccc', so USER_A < USER_C.

let seed: SeedResult;
let convAC: string;
let broadcastA: string;

beforeAll(async () => {
  seed = await seedTwoSchools();
  const sql = dbAsAdmin();

  await sql.unsafe(`set session_replication_role = replica`);

  await sql.unsafe(`
    insert into public.users (id, school_id, email, full_name, timezone) values
      ('${USER_C}', '${SCHOOL_A}', 'student-c@alpha.test', 'Alpha Student C', 'America/Chicago')
  `);
  await sql.unsafe(`
    insert into public.user_roles (user_id, role, mechanic_authority, is_default) values
      ('${USER_C}', 'student', 'none', true)
  `);

  // Conversation between A (lower) and C (higher). user_a_low must be < user_b_high.
  const convRows = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.conversation
      (school_id, user_a_low, user_b_high)
    values
      ('${SCHOOL_A}', '${USER_A}', '${USER_C}')
    returning id
  `);
  convAC = convRows[0]!.id;

  // One message from A to C.
  await sql.unsafe(`
    insert into public.message
      (conversation_id, school_id, sender_id, body)
    values
      ('${convAC}', '${SCHOOL_A}', '${USER_A}', 'Hello C from A')
  `);

  // Admin broadcast in school A.
  const bRows = await sql.unsafe<Array<{ id: string }>>(`
    insert into public.broadcast
      (school_id, sender_id, target_roles, title, body, urgency)
    values
      ('${SCHOOL_A}', '${USER_A}', ARRAY['student']::text[], 'Hello students', 'Test broadcast body', 'normal')
    returning id
  `);
  broadcastA = bRows[0]!.id;

  await sql.unsafe(`set session_replication_role = origin`);
});

afterAll(async () => {
  await closeAdmin();
});

describe('phase 8 messaging participant-only visibility', () => {
  it('user A sees the A↔C conversation', async () => {
    const rows = await asUserOf(
      { userId: USER_A, schoolId: SCHOOL_A, activeRole: 'admin' },
      (sql) =>
        sql.unsafe<Array<{ id: string }>>(
          `select id from public.conversation where id = '${convAC}'`,
        ),
    );
    expect(rows).toHaveLength(1);
  });

  it('user C sees the A↔C conversation', async () => {
    const rows = await asUserOf(
      { userId: USER_C, schoolId: SCHOOL_A, activeRole: 'student' },
      (sql) =>
        sql.unsafe<Array<{ id: string }>>(
          `select id from public.conversation where id = '${convAC}'`,
        ),
    );
    expect(rows).toHaveLength(1);
  });

  it('user B (school B) cannot see the school A conversation', async () => {
    const rows = await asUserOf(
      { userId: USER_B, schoolId: SCHOOL_B, activeRole: 'admin' },
      (sql) =>
        sql.unsafe<Array<{ id: string }>>(
          `select id from public.conversation where id = '${convAC}'`,
        ),
    );
    expect(rows).toHaveLength(0);
  });
});

describe('phase 8 messaging message RLS', () => {
  it('user A sees messages in their conversation', async () => {
    const rows = await asUserOf(
      { userId: USER_A, schoolId: SCHOOL_A, activeRole: 'admin' },
      (sql) =>
        sql.unsafe<Array<{ body: string }>>(
          `select body from public.message where conversation_id = '${convAC}'`,
        ),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.body).toContain('Hello');
  });

  it('non-participant user B cannot see messages from school A', async () => {
    const rows = await asUserOf(
      { userId: USER_B, schoolId: SCHOOL_B, activeRole: 'admin' },
      (sql) =>
        sql.unsafe<Array<{ body: string }>>(
          `select body from public.message where conversation_id = '${convAC}'`,
        ),
    );
    expect(rows).toHaveLength(0);
  });

  it('user C can insert a message into their own conversation', async () => {
    const rows = await asUserOf(
      { userId: USER_C, schoolId: SCHOOL_A, activeRole: 'student' },
      (sql) =>
        sql.unsafe<Array<{ id: string }>>(
          `insert into public.message (conversation_id, school_id, sender_id, body)
             values ('${convAC}', '${SCHOOL_A}', '${USER_C}', 'Reply from C')
           returning id`,
        ),
    );
    expect(rows).toHaveLength(1);
  });

  it('user B cannot spoof a message into school A conversation', async () => {
    const outcome = await asUserOf(
      { userId: USER_B, schoolId: SCHOOL_B, activeRole: 'admin' },
      async (sql) => {
        try {
          await sql.unsafe(
            `insert into public.message (conversation_id, school_id, sender_id, body)
               values ('${convAC}', '${SCHOOL_A}', '${USER_B}', 'spoof')`,
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

describe('phase 8 broadcast admin-write', () => {
  it('student (non-admin) cannot INSERT a broadcast', async () => {
    const outcome = await asUserOf(
      { userId: USER_C, schoolId: SCHOOL_A, activeRole: 'student' },
      async (sql) => {
        try {
          await sql.unsafe(
            `insert into public.broadcast (school_id, sender_id, target_roles, title, body, urgency)
               values ('${SCHOOL_A}', '${USER_C}', ARRAY['student']::text[], 'bad', 'bad', 'normal')`,
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

  it('student in school A can SELECT broadcasts in their school', async () => {
    const rows = await asUserOf(
      { userId: USER_C, schoolId: SCHOOL_A, activeRole: 'student' },
      (sql) =>
        sql.unsafe<Array<{ id: string }>>(
          `select id from public.broadcast where id = '${broadcastA}'`,
        ),
    );
    expect(rows).toHaveLength(1);
  });

  it('school B user cannot SELECT school A broadcast', async () => {
    const rows = await asUserOf(
      { userId: USER_B, schoolId: SCHOOL_B, activeRole: 'admin' },
      (sql) =>
        sql.unsafe<Array<{ id: string }>>(
          `select id from public.broadcast where id = '${broadcastA}'`,
        ),
    );
    expect(rows).toHaveLength(0);
  });
});
