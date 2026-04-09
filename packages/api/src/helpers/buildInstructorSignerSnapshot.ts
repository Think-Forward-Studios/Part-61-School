/**
 * Instructor signer snapshot (Phase 5-03).
 *
 * COPIED, NOT REFERENCED — identical contract to Phase 4's
 * buildSignerSnapshot for mechanics. The returned object is a frozen
 * snapshot of the instructor's identity at sign time.
 *
 * Used by gradeSheet.seal, admin.stageChecks.record, and
 * admin.endorsements.issue.
 */
import { TRPCError } from '@trpc/server';
import { sql } from 'drizzle-orm';

type Tx = {
  execute: (q: ReturnType<typeof sql>) => Promise<unknown>;
};

export type InstructorCertificateType = 'cfi' | 'cfii' | 'mei' | 'admin';

export interface InstructorSignerSnapshot {
  user_id: string;
  full_name: string;
  certificate_type: InstructorCertificateType;
  certificate_number: string | null;
  signed_at: string;
}

export async function buildInstructorSignerSnapshot(
  tx: Tx,
  userId: string,
  activeRole: string,
): Promise<InstructorSignerSnapshot> {
  if (activeRole !== 'instructor' && activeRole !== 'admin') {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Instructor or admin role required to sign',
    });
  }

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

  const certType: InstructorCertificateType =
    activeRole === 'admin' ? 'admin' : 'cfi';

  const snapshot: InstructorSignerSnapshot = {
    user_id: row.user_id,
    full_name: row.full_name ?? 'Unknown',
    certificate_type: certType,
    certificate_number: row.faa_airman_cert_number,
    signed_at: new Date().toISOString(),
  };

  return Object.freeze({ ...snapshot }) as InstructorSignerSnapshot;
}
