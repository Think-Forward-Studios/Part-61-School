/**
 * admin.activeSessions router (Plan 08-01 Task 3 — MSG-03).
 *
 * Lists users last seen within 5 minutes. Joins user_session_activity
 * to users for display fields (email, full_name). Admin-only.
 */
import { sql } from 'drizzle-orm';

import { router } from '../../trpc';
import { adminProcedure } from '../../procedures';

type Tx = {
  execute: (q: ReturnType<typeof sql>) => Promise<unknown>;
};

interface ActiveSessionRow {
  user_id: string;
  email: string;
  full_name: string | null;
  active_role: string | null;
  active_base_id: string | null;
  last_seen_at: string;
}

export const adminActiveSessionsRouter = router({
  list: adminProcedure.query(async ({ ctx }) => {
    const tx = ctx.tx as Tx;
    const rows = (await tx.execute(sql`
      select
        a.user_id,
        u.email,
        u.full_name,
        a.active_role,
        a.active_base_id,
        a.last_seen_at
      from public.user_session_activity a
      join public.users u on u.id = a.user_id
      where a.school_id = ${ctx.session!.schoolId}::uuid
        and a.last_seen_at > now() - interval '5 minutes'
      order by a.last_seen_at desc
    `)) as unknown as ActiveSessionRow[];
    return rows;
  }),
});
