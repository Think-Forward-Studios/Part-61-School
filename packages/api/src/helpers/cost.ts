/**
 * Cost computation helpers — REP-03, REP-04.
 *
 * computeLiveCost: sum of (flight hours × applicable rate) for a student.
 * computeProjectedCost: live cost + (remaining required hours × current rate).
 *
 * Rate precedence: aircraft-specific > makeModel > unscoped default.
 */
import { sql } from 'drizzle-orm';

type Tx = {
  execute: (q: ReturnType<typeof sql>) => Promise<unknown>;
};

interface CostBreakdown {
  aircraftCents: number;
  instructorCents: number;
  groundCents: number;
  surchargeCents: number;
}

export interface LiveCostResult {
  totalCents: number;
  breakdown: CostBreakdown;
  currency: string;
  missingRates: string[];
}

/**
 * Compute the to-date training cost for a student by joining
 * flight_log_time entries with the effective school_rate at each
 * entry's flown_at timestamp.
 */
export async function computeLiveCost(
  tx: Tx,
  { studentId, schoolId }: { studentId: string; schoolId: string },
): Promise<LiveCostResult> {
  // Sum flight hours by category, matched against rates effective at
  // the time of each flight. Uses lateral join for rate resolution with
  // precedence: aircraft_id match > aircraft_make_model match > unscoped.
  const rows = (await tx.execute(sql`
    with student_times as (
      select
        flt.kind,
        flt.hours,
        flt.flown_at,
        fle.aircraft_id,
        a.make_model as aircraft_make_model
      from public.flight_log_time flt
      join public.flight_log_entry fle on fle.id = flt.flight_log_entry_id
      left join public.aircraft a on a.id = fle.aircraft_id
      where flt.user_id = ${studentId}::uuid
        and fle.school_id = ${schoolId}::uuid
    ),
    rated as (
      select
        st.kind,
        st.hours,
        (
          select sr.amount_cents
          from public.school_rate sr
          where sr.school_id = ${schoolId}::uuid
            and sr.deleted_at is null
            and sr.kind = case
              when st.kind in ('pic','dual_received','solo','xc','night') then 'aircraft_wet'
              when st.kind = 'ground' then 'ground_instructor'
              when st.kind = 'ifr' then 'aircraft_wet'
              else 'aircraft_wet'
            end
            and sr.effective_from <= st.flown_at
            and (sr.effective_until is null or sr.effective_until > st.flown_at)
          order by
            case when sr.aircraft_id = st.aircraft_id then 0
                 when sr.aircraft_make_model = st.aircraft_make_model then 1
                 else 2 end,
            sr.effective_from desc
          limit 1
        ) as rate_cents,
        case
          when st.kind in ('pic','dual_received','solo','xc','night','ifr') then 'aircraft'
          when st.kind = 'ground' then 'ground'
          else 'aircraft'
        end as category,
        -- Also get instructor rate for dual_received
        case when st.kind = 'dual_received' then (
          select sr2.amount_cents
          from public.school_rate sr2
          where sr2.school_id = ${schoolId}::uuid
            and sr2.deleted_at is null
            and sr2.kind = 'instructor'
            and sr2.effective_from <= st.flown_at
            and (sr2.effective_until is null or sr2.effective_until > st.flown_at)
          order by sr2.effective_from desc
          limit 1
        ) else null end as instructor_rate_cents
      from student_times st
    )
    select
      coalesce(sum(case when category = 'aircraft' then (hours * coalesce(rate_cents, 0))::bigint else 0 end), 0)::bigint as aircraft_cents,
      coalesce(sum(case when kind = 'dual_received' then (hours * coalesce(instructor_rate_cents, 0))::bigint else 0 end), 0)::bigint as instructor_cents,
      coalesce(sum(case when category = 'ground' then (hours * coalesce(rate_cents, 0))::bigint else 0 end), 0)::bigint as ground_cents,
      0::bigint as surcharge_cents,
      array_agg(distinct case when rate_cents is null then category else null end) filter (where rate_cents is null) as missing_rates
    from rated
  `)) as unknown as Array<{
    aircraft_cents: string;
    instructor_cents: string;
    ground_cents: string;
    surcharge_cents: string;
    missing_rates: string[] | null;
  }>;

  const row = rows[0];
  const aircraftCents = Number(row?.aircraft_cents ?? 0);
  const instructorCents = Number(row?.instructor_cents ?? 0);
  const groundCents = Number(row?.ground_cents ?? 0);
  const surchargeCents = Number(row?.surcharge_cents ?? 0);

  return {
    totalCents: aircraftCents + instructorCents + groundCents + surchargeCents,
    breakdown: { aircraftCents, instructorCents, groundCents, surchargeCents },
    currency: 'USD',
    missingRates: (row?.missing_rates ?? []).filter(Boolean),
  };
}

/**
 * Compute projected total cost: live cost + (remaining required hours × current rate).
 * Uses Phase 6 student_minimums_tracker for remaining hours.
 */
export async function computeProjectedCost(
  tx: Tx,
  {
    studentId,
    enrollmentId,
    schoolId,
  }: { studentId: string; enrollmentId: string; schoolId: string },
): Promise<{ projectedTotalCents: number; remainingCostCents: number } | null> {
  // Get remaining hours from student_minimums_tracker (Phase 6)
  const remainingRows = (await tx.execute(sql`
    select
      coalesce(sum(greatest(required_hours - logged_hours, 0)), 0) as remaining_hours
    from public.student_minimums_tracker
    where enrollment_id = ${enrollmentId}::uuid
  `)) as unknown as Array<{ remaining_hours: number }>;

  const remainingHours = Number(remainingRows[0]?.remaining_hours ?? 0);
  if (remainingHours <= 0) return null;

  // Get current default wet rate
  const rateRows = (await tx.execute(sql`
    select amount_cents from public.school_rate
    where school_id = ${schoolId}::uuid
      and deleted_at is null
      and kind = 'aircraft_wet'
      and aircraft_id is null
      and aircraft_make_model is null
      and effective_from <= now()
      and (effective_until is null or effective_until > now())
    order by effective_from desc
    limit 1
  `)) as unknown as Array<{ amount_cents: number }>;

  const wetRate = Number(rateRows[0]?.amount_cents ?? 0);

  // Also get instructor rate
  const instrRows = (await tx.execute(sql`
    select amount_cents from public.school_rate
    where school_id = ${schoolId}::uuid
      and deleted_at is null
      and kind = 'instructor'
      and instructor_id is null
      and effective_from <= now()
      and (effective_until is null or effective_until > now())
    order by effective_from desc
    limit 1
  `)) as unknown as Array<{ amount_cents: number }>;

  const instrRate = Number(instrRows[0]?.amount_cents ?? 0);

  const live = await computeLiveCost(tx, { studentId, schoolId });
  const remainingCostCents = Math.round(remainingHours * (wetRate + instrRate));

  return {
    projectedTotalCents: live.totalCents + remainingCostCents,
    remainingCostCents,
  };
}
