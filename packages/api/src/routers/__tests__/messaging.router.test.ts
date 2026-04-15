/**
 * Integration tests for the messaging router against real Postgres.
 *
 * Seeds two users in the same school, exercises open → thread.send →
 * list → markRead. Participant-check + school_id scoping are both
 * enforced by RLS and by the router's early check.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import postgres from 'postgres';

import { appRouter } from '../_root';
import type { Session } from '../../session';

const URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const SCHOOL = '99999999-9999-9999-9999-999999999999';
const USER_A = '99999999-9999-9999-9999-999999999911';
const USER_B = '99999999-9999-9999-9999-999999999922';
const BASE_ID = '99999999-9999-9999-9999-999999999933';

let admin: ReturnType<typeof postgres>;

async function seed() {
  await admin.unsafe(`set session_replication_role = replica`);
  await admin.unsafe(`delete from public.message_read where user_id in ('${USER_A}','${USER_B}')`);
  await admin.unsafe(`delete from public.message where sender_id in ('${USER_A}','${USER_B}')`);
  await admin.unsafe(`delete from public.conversation where school_id = '${SCHOOL}'`);
  await admin.unsafe(`delete from public.user_roles where user_id in ('${USER_A}','${USER_B}')`);
  await admin.unsafe(`delete from public.users where id in ('${USER_A}','${USER_B}')`);
  await admin.unsafe(`delete from public.bases where id = '${BASE_ID}'`);
  await admin.unsafe(`delete from public.schools where id = '${SCHOOL}'`);

  await admin.unsafe(`
    insert into public.schools (id, name, timezone)
    values ('${SCHOOL}', 'Messaging Test School', 'UTC')
  `);
  await admin.unsafe(`
    insert into public.bases (id, school_id, name, timezone)
    values ('${BASE_ID}', '${SCHOOL}', 'Main', 'UTC')
  `);
  await admin.unsafe(`
    insert into public.users (id, school_id, email, full_name, timezone) values
      ('${USER_A}', '${SCHOOL}', 'msg-a@alpha.test', 'User A', 'UTC'),
      ('${USER_B}', '${SCHOOL}', 'msg-b@alpha.test', 'User B', 'UTC')
  `);
  await admin.unsafe(`
    insert into public.user_roles (user_id, role, mechanic_authority, is_default) values
      ('${USER_A}', 'admin', 'none', true),
      ('${USER_B}', 'admin', 'none', true)
  `);

  await admin.unsafe(`set session_replication_role = origin`);
}

function session(userId: string): Session {
  return {
    userId,
    schoolId: SCHOOL,
    email: `${userId}@test`,
    roles: ['admin'],
    activeRole: 'admin',
    activeBaseId: BASE_ID,
  };
}

function caller(userId: string) {
  return appRouter.createCaller({
    session: session(userId),
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

describe('messaging.conversations.open', () => {
  it('rejects self-conversation', async () => {
    const me = caller(USER_A);
    await expect(me.messaging.conversations.open({ otherUserId: USER_A })).rejects.toThrow(
      /yourself/i,
    );
  });

  it('creates a canonical pair conversation', async () => {
    const me = caller(USER_A);
    const conv = await me.messaging.conversations.open({ otherUserId: USER_B });
    expect(conv).toBeTruthy();
    // user_a_low must be the lexicographically smaller of A and B.
    const low = USER_A < USER_B ? USER_A : USER_B;
    const high = USER_A < USER_B ? USER_B : USER_A;
    expect((conv as { user_a_low: string }).user_a_low).toBe(low);
    expect((conv as { user_b_high: string }).user_b_high).toBe(high);
  });

  it('second open returns the same conversation id', async () => {
    const me = caller(USER_A);
    const first = await me.messaging.conversations.open({ otherUserId: USER_B });
    const again = await me.messaging.conversations.open({ otherUserId: USER_B });
    expect((again as { id: string }).id).toBe((first as { id: string }).id);
  });
});

describe('messaging.thread.send + list + markRead', () => {
  it('round-trips a message from A to B', async () => {
    const a = caller(USER_A);
    const b = caller(USER_B);
    const conv = (await a.messaging.conversations.open({
      otherUserId: USER_B,
    })) as { id: string };

    await a.messaging.thread.send({
      conversationId: conv.id,
      body: 'Hi from A',
    });

    const bThreads = await b.messaging.thread.list({
      conversationId: conv.id,
    });
    expect(bThreads.length).toBeGreaterThan(0);
    expect(bThreads[0]!.body).toContain('Hi');

    const markResult = await b.messaging.thread.markRead({
      conversationId: conv.id,
    });
    expect(markResult).toEqual({ ok: true });
  });
});
