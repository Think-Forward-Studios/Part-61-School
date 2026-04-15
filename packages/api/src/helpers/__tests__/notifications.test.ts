/**
 * TDD tests for the createNotification helper (Phase 8 Plan 08-01 Task 2).
 *
 * The helper is called from tRPC mutations INSIDE a Drizzle transaction
 * opened by withTenantTx. Its responsibilities:
 *
 *   1. Look up effective in_app + email prefs via
 *      user_notification_pref (LEFT JOIN) notification_default_by_role.
 *   2. Always write an in-app row if is_safety_critical = true
 *      (regardless of user pref).
 *   3. Only write an email_outbox row if the email channel is enabled
 *      in the effective pref AND emailTemplateKey is provided.
 *   4. Use idempotency_key = `${notificationId}:${kind}` with
 *      ON CONFLICT DO NOTHING so re-runs don't duplicate.
 *   5. Never swallow errors — let the transaction roll back.
 *
 * Tests use a mocked `tx` that records every .execute() call and can
 * return canned results for the pref lookup + user email lookup.
 */
import { describe, expect, it, vi } from 'vitest';

import { createNotification } from '../notifications';

type SqlCall = { text: string; values: unknown[] };

interface MockTx {
  calls: SqlCall[];
  responses: unknown[][];
  execute: (q: unknown) => Promise<unknown[]>;
}

/**
 * Build a minimal tx double. `responses` is popped in FIFO order for
 * every execute() call, returning [] if no canned response is queued.
 */
function makeMockTx(responses: unknown[][]): MockTx {
  const queue = [...responses];
  const calls: SqlCall[] = [];
  const execute = vi.fn(async (q: unknown) => {
    // Drizzle sql`...` objects expose `queryChunks` + `sql`. We record
    // a readable stringified form so tests can pattern-match the
    // intent of each SQL statement without caring about whitespace.
    const repr =
      (q as { sql?: string; queryChunks?: unknown[] }).sql ??
      String((q as { queryChunks?: unknown[] }).queryChunks ?? q);
    calls.push({ text: repr, values: [] });
    return queue.shift() ?? [];
  });
  return { calls, responses: queue, execute };
}

const USER_ID = '11111111-1111-1111-1111-111111111111';
const SCHOOL_ID = '22222222-2222-2222-2222-222222222222';
const NOTIF_ID = '33333333-3333-3333-3333-333333333333';

describe('createNotification — pref resolution', () => {
  it('inserts in-app row when pref is enabled; queues email when both channels on', async () => {
    const tx = makeMockTx([
      // effective-prefs lookup — both channels enabled
      [
        { channel: 'in_app', enabled: true },
        { channel: 'email', enabled: true },
      ],
      // in-app notifications insert returning id
      [{ id: NOTIF_ID }],
      // users lookup for email
      [{ email: 'student@alpha.test' }],
      // email_outbox insert returning id
      [{ id: 'outbox-1' }],
    ]);

    const result = await createNotification(tx as unknown as never, {
      schoolId: SCHOOL_ID,
      userId: USER_ID,
      activeRole: 'student',
      kind: 'reservation_approved',
      title: 'Your reservation is confirmed',
      body: 'See you in the air',
      emailTemplateKey: 'reservation_approved',
      emailTemplateProps: { foo: 'bar' },
    });

    expect(result.notificationId).toBe(NOTIF_ID);
    expect(result.emailQueued).toBe(true);
    expect(tx.execute).toHaveBeenCalledTimes(4);
  });

  it('skips email_outbox when user email pref is disabled', async () => {
    const tx = makeMockTx([
      [
        { channel: 'in_app', enabled: true },
        { channel: 'email', enabled: false },
      ],
      [{ id: NOTIF_ID }],
    ]);

    const result = await createNotification(tx as unknown as never, {
      schoolId: SCHOOL_ID,
      userId: USER_ID,
      activeRole: 'student',
      kind: 'reservation_approved',
      title: 'x',
      body: 'y',
      emailTemplateKey: 'reservation_approved',
      emailTemplateProps: {},
    });

    expect(result.notificationId).toBe(NOTIF_ID);
    expect(result.emailQueued).toBe(false);
    // Only 2 calls: effective-prefs + in_app insert. No email lookup or outbox.
    expect(tx.execute).toHaveBeenCalledTimes(2);
  });

  it('safety-critical always writes in-app; email still respects user pref', async () => {
    const tx = makeMockTx([
      // user has both channels off
      [
        { channel: 'in_app', enabled: false },
        { channel: 'email', enabled: false },
      ],
      // in-app still inserted because is_safety_critical
      [{ id: NOTIF_ID }],
      // email pref was off so no users lookup or outbox insert happen
    ]);

    const result = await createNotification(tx as unknown as never, {
      schoolId: SCHOOL_ID,
      userId: USER_ID,
      activeRole: 'admin',
      kind: 'overdue_aircraft',
      title: 'Overdue',
      body: 'aircraft',
      isSafetyCritical: true,
      emailTemplateKey: 'admin_broadcast',
      emailTemplateProps: {},
    });

    expect(result.notificationId).toBe(NOTIF_ID);
    expect(result.emailQueued).toBe(false);
    expect(tx.execute).toHaveBeenCalledTimes(2);
  });

  it('falls back to role defaults when user has no pref row for the kind', async () => {
    const tx = makeMockTx([
      // zero user-pref rows; effective lookup includes default-by-role
      // via COALESCE in SQL — we simulate that by returning the
      // role-default verdict
      [
        { channel: 'in_app', enabled: true },
        { channel: 'email', enabled: true },
      ],
      [{ id: NOTIF_ID }],
      [{ email: 'user@test' }],
      [{ id: 'outbox-2' }],
    ]);

    const result = await createNotification(tx as unknown as never, {
      schoolId: SCHOOL_ID,
      userId: USER_ID,
      activeRole: 'student',
      kind: 'reservation_approved',
      title: 'x',
      body: 'y',
      emailTemplateKey: 'reservation_approved',
      emailTemplateProps: {},
    });

    expect(result.notificationId).toBe(NOTIF_ID);
    expect(result.emailQueued).toBe(true);
  });
});

describe('createNotification — error propagation', () => {
  it('propagates execute errors so the outer tx rolls back', async () => {
    const tx: MockTx = {
      calls: [],
      responses: [],
      execute: vi.fn(async () => {
        throw new Error('boom');
      }),
    };

    await expect(
      createNotification(tx as unknown as never, {
        schoolId: SCHOOL_ID,
        userId: USER_ID,
        activeRole: 'student',
        kind: 'reservation_approved',
        title: 'x',
        body: 'y',
      }),
    ).rejects.toThrow('boom');
  });
});

describe('createNotification — no email queue when template key absent', () => {
  it('inserts in-app only when emailTemplateKey is undefined even if email pref is on', async () => {
    const tx = makeMockTx([
      [
        { channel: 'in_app', enabled: true },
        { channel: 'email', enabled: true },
      ],
      [{ id: NOTIF_ID }],
    ]);

    const result = await createNotification(tx as unknown as never, {
      schoolId: SCHOOL_ID,
      userId: USER_ID,
      activeRole: 'student',
      kind: 'reservation_approved',
      title: 'x',
      body: 'y',
    });

    expect(result.notificationId).toBe(NOTIF_ID);
    expect(result.emailQueued).toBe(false);
    expect(tx.execute).toHaveBeenCalledTimes(2);
  });
});

describe('createNotification — in-app disabled path', () => {
  it('returns null notificationId when in_app pref is off and not safety-critical', async () => {
    const tx = makeMockTx([
      [
        { channel: 'in_app', enabled: false },
        { channel: 'email', enabled: false },
      ],
    ]);

    const result = await createNotification(tx as unknown as never, {
      schoolId: SCHOOL_ID,
      userId: USER_ID,
      activeRole: 'student',
      kind: 'reservation_approved',
      title: 'x',
      body: 'y',
    });

    expect(result.notificationId).toBeNull();
    expect(result.emailQueued).toBe(false);
    expect(tx.execute).toHaveBeenCalledTimes(1);
  });
});
