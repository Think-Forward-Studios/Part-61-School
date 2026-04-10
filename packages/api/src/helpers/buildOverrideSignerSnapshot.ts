/**
 * Override signer snapshot (Phase 6-02).
 *
 * Mirrors Phase 5's buildInstructorSignerSnapshot. The returned object
 * is a frozen snapshot of the granting authority's identity at grant
 * time, stored on the lesson_override row for audit purposes.
 */
import { TRPCError } from '@trpc/server';
import { sql } from 'drizzle-orm';

type Tx = {
  execute: (q: ReturnType<typeof sql>) => Promise<unknown>;
};

export interface OverrideSignerSnapshot {
  user_id: string;
  full_name: string;
  cert_type: string;
  cert_number: string | null;
  granted_at: string;
}

export async function buildOverrideSignerSnapshot(
  tx: Tx,
  userId: string,
): Promise<OverrideSignerSnapshot> {
  const rows = (await tx.execute(sql`
    select
      u.id as user_id,
      coalesce(
        nullif(trim(concat_ws(' ', pp.first_name, pp.last_name)), ''),
        u.full_name,
        u.email
      ) as full_name,
      pp.faa_airman_cert_number
    from public.users u
    left join public.person_profile pp on pp.user_id = u.id
    where u.id = ${userId}
    limit 1
  `)) as unknown as Array<{
    user_id: string;
    full_name: string | null;
    faa_airman_cert_number: string | null;
  }>;

  const row = rows[0];
  if (!row) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Signer not found' });
  }

  const snapshot: OverrideSignerSnapshot = {
    user_id: row.user_id,
    full_name: row.full_name ?? 'Unknown',
    cert_type: 'chief_instructor',
    cert_number: row.faa_airman_cert_number,
    granted_at: new Date().toISOString(),
  };

  return Object.freeze({ ...snapshot }) as OverrideSignerSnapshot;
}
