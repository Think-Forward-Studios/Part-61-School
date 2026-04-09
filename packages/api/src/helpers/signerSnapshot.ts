/**
 * Signer snapshot builder + mechanic-authority gate (Phase 4 / MNT).
 *
 * COPIED, NOT REFERENCED: the returned object is a frozen snapshot of
 * the mechanic's identity at sign time. Mutating the user's
 * person_profile row afterwards does NOT change the returned object.
 * This is the FAA inspection integrity contract.
 */
import { TRPCError } from '@trpc/server';
import { sql } from 'drizzle-orm';
import type { SignerSnapshot, MechanicAuthorityKind } from '@part61/domain';

type Tx = {
  execute: (q: ReturnType<typeof sql>) => Promise<unknown>;
};

export type RequiredMechanicAuthority = 'a_and_p' | 'ia';

function satisfies(
  actual: MechanicAuthorityKind | null | undefined,
  required: RequiredMechanicAuthority,
): boolean {
  if (!actual || actual === 'none') return false;
  if (required === 'a_and_p') return actual === 'a_and_p' || actual === 'ia';
  return actual === 'ia';
}

/**
 * Throws FORBIDDEN if the provided mechanic_authority does not meet
 * the requirement. Pure / no DB access.
 */
export function requireMechanicAuthority(
  actual: MechanicAuthorityKind | null | undefined,
  required: RequiredMechanicAuthority,
): asserts actual is RequiredMechanicAuthority {
  if (!satisfies(actual, required)) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message:
        required === 'ia'
          ? 'IA authority required for this action.'
          : 'A&P (or IA) authority required for this action.',
    });
  }
}

/**
 * Build a signer snapshot for the given user, validating their
 * mechanic_authority meets `required`. Returns a frozen object so
 * callers document the copied-not-referenced contract.
 *
 * Throws:
 *   FORBIDDEN           — user lacks required mechanic_authority
 *   FAILED_PRECONDITION — user missing faa_airman_cert_number
 *   NOT_FOUND           — user not found in the tenant
 */
export async function buildSignerSnapshot(
  tx: Tx,
  userId: string,
  required: RequiredMechanicAuthority,
): Promise<SignerSnapshot> {
  const rows = (await tx.execute(sql`
    select
      u.id as user_id,
      coalesce(
        nullif(trim(concat_ws(' ', pp.first_name, pp.last_name)), ''),
        u.full_name,
        u.email
      ) as full_name,
      pp.faa_airman_cert_number,
      (
        select max(ur.mechanic_authority::text)
          from public.user_roles ur
          where ur.user_id = u.id
            and ur.mechanic_authority in ('a_and_p','ia')
      ) as mechanic_authority
    from public.users u
    left join public.person_profile pp on pp.user_id = u.id
    where u.id = ${userId}
    limit 1
  `)) as unknown as Array<{
    user_id: string;
    full_name: string | null;
    faa_airman_cert_number: string | null;
    mechanic_authority: string | null;
  }>;

  const row = rows[0];
  if (!row) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Signer not found' });
  }

  const authority = (row.mechanic_authority ?? 'none') as MechanicAuthorityKind;
  requireMechanicAuthority(authority, required);

  if (!row.faa_airman_cert_number || row.faa_airman_cert_number.trim() === '') {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'Signer is missing an FAA airman certificate number.',
    });
  }

  const snapshot: SignerSnapshot = {
    user_id: row.user_id,
    full_name: row.full_name ?? 'Unknown',
    certificate_type: authority === 'ia' ? 'ia' : 'a_and_p',
    certificate_number: row.faa_airman_cert_number,
    signed_at: new Date().toISOString(),
  };

  return Object.freeze({ ...snapshot }) as SignerSnapshot;
}

/**
 * Read a user's current mechanic_authority from user_roles (highest
 * across roles). Returns 'none' if none.
 */
export async function getMechanicAuthority(
  tx: Tx,
  userId: string,
): Promise<MechanicAuthorityKind> {
  const rows = (await tx.execute(sql`
    select
      (
        select max(ur.mechanic_authority::text)
          from public.user_roles ur
          where ur.user_id = ${userId}
            and ur.mechanic_authority in ('a_and_p','ia')
      ) as mechanic_authority
  `)) as unknown as Array<{ mechanic_authority: string | null }>;
  const v = rows[0]?.mechanic_authority;
  if (v === 'ia' || v === 'a_and_p') return v;
  return 'none';
}
