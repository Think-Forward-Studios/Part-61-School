/**
 * Instructor duty-hour accumulator — FAR 61.195(a)(2).
 *
 * 8 hours of flight instruction in any 24-hour period is the hard
 * limit. We warn at 7h and block at 8h.
 *
 * RESEARCH Pitfall 7: retroactive scheduling (proposed start in the
 * past) MUST NOT trigger the check — it returns clean.
 */
import { sql } from 'drizzle-orm';

type Tx = {
  execute: (q: ReturnType<typeof sql>) => Promise<unknown>;
};

/**
 * Sum of flight-activity reservation minutes for the given instructor
 * in the 24h window ending at `windowEnd`. Only counts reservations
 * with actionable statuses (approved+).
 */
export async function instructorDutyMinutesInWindow(
  tx: Tx,
  instructorId: string,
  windowEnd: Date,
): Promise<number> {
  const rows = (await tx.execute(sql`
    select coalesce(sum(
      extract(epoch from (upper(time_range) - lower(time_range))) / 60
    ), 0)::int as minutes
      from public.reservation
     where instructor_id = ${instructorId}::uuid
       and deleted_at is null
       and activity_type = 'flight'
       and status in ('approved','dispatched','flown','pending_sign_off','closed')
       and lower(time_range) >= ${windowEnd.toISOString()}::timestamptz - interval '24 hours'
       and lower(time_range) <  ${windowEnd.toISOString()}::timestamptz
  `)) as unknown as Array<{ minutes: number }>;
  return rows[0]?.minutes ?? 0;
}

export interface DutyCheckResult {
  warn: boolean;
  block: boolean;
  existingMinutes: number;
  proposedMinutes: number;
  totalMinutes: number;
}

/**
 * Check whether approving a proposed reservation would exceed the
 * instructor's duty-hour limits. Returns warn/block flags.
 *
 * Retroactive reservations (proposedStart ≤ now) return clean per
 * RESEARCH Pitfall 7.
 */
export async function checkDutyHoursForProposal(
  tx: Tx,
  {
    instructorId,
    proposedStart,
    proposedEnd,
  }: {
    instructorId: string;
    proposedStart: Date;
    proposedEnd: Date;
  },
): Promise<DutyCheckResult> {
  // Retroactive scheduling bypass
  if (proposedStart <= new Date()) {
    return {
      warn: false,
      block: false,
      existingMinutes: 0,
      proposedMinutes: 0,
      totalMinutes: 0,
    };
  }
  const existingMinutes = await instructorDutyMinutesInWindow(tx, instructorId, proposedEnd);
  const proposedMinutes = Math.ceil((proposedEnd.getTime() - proposedStart.getTime()) / 60_000);
  const totalMinutes = existingMinutes + proposedMinutes;
  return {
    warn: totalMinutes > 7 * 60,
    block: totalMinutes > 8 * 60,
    existingMinutes,
    proposedMinutes,
    totalMinutes,
  };
}
