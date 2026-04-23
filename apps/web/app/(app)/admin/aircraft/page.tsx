import Link from 'next/link';
import { eq, sql } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { db, users } from '@part61/db';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { AircraftTable, type AircraftRow } from './AircraftTable';
import { PageHeader } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function AdminAircraftPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const me = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  const schoolId = me[0]?.schoolId;
  if (!schoolId) redirect('/login');

  // Join aircraft against:
  //   - aircraft_current_totals view (Hobbs / Tach / airframe / last flown)
  //     — built on flight_log_entry so it reflects every recorded flight
  //     including baseline-snapshot entries.
  //   - bases for the home-base name column.
  //   - maintenance_item for the soonest next-due task (ignoring resolved
  //     or deleted items).
  //   - public.is_airworthy_at(id, now()) for the go/no-go chip.
  // One query means the list stays fast even with 50+ aircraft.
  const rowsRaw = (await db.execute(sql`
    select
      a.id,
      a.tail_number,
      a.make,
      a.model,
      a.year,
      b.name as base_name,
      a.grounded_at,
      coalesce(act.current_hobbs, 0)    as current_hobbs,
      coalesce(act.current_tach, 0)     as current_tach,
      coalesce(act.current_airframe, 0) as current_airframe,
      act.last_flown_at                 as last_flown_at,
      public.is_airworthy_at(a.id, now()) as airworthy,
      (
        select min(mi.next_due_at)
          from public.maintenance_item mi
         where mi.aircraft_id = a.id
           and mi.deleted_at is null
           and mi.status <> 'deferred'
           and mi.next_due_at is not null
      ) as next_due_at,
      (
        select mi.title
          from public.maintenance_item mi
         where mi.aircraft_id = a.id
           and mi.deleted_at is null
           and mi.status <> 'deferred'
           and mi.next_due_at is not null
         order by mi.next_due_at asc
         limit 1
      ) as next_due_title
    from public.aircraft a
    left join public.bases b on b.id = a.base_id
    left join public.aircraft_current_totals act on act.aircraft_id = a.id
    where a.school_id = ${schoolId}
      and a.deleted_at is null
    order by a.tail_number
  `)) as unknown as Array<{
    id: string;
    tail_number: string;
    make: string | null;
    model: string | null;
    year: number | null;
    base_name: string | null;
    grounded_at: string | null;
    current_hobbs: string | number;
    current_tach: string | number;
    current_airframe: string | number;
    last_flown_at: string | null;
    airworthy: boolean | null;
    next_due_at: string | null;
    next_due_title: string | null;
  }>;

  const rows: AircraftRow[] = rowsRaw.map((r) => ({
    id: r.id,
    tailNumber: r.tail_number,
    make: r.make,
    model: r.model,
    year: r.year,
    baseName: r.base_name,
    grounded: r.grounded_at != null,
    airworthy: r.airworthy ?? false,
    currentHobbs: Number(r.current_hobbs ?? 0),
    currentTach: Number(r.current_tach ?? 0),
    currentAirframe: Number(r.current_airframe ?? 0),
    lastFlownAt: r.last_flown_at,
    nextDueAt: r.next_due_at,
    nextDueTitle: r.next_due_title,
  }));

  return (
    <main style={{ padding: '0 1.5rem 2rem', maxWidth: 1500, margin: '0 auto' }}>
      <PageHeader
        eyebrow="Maintenance"
        title="Fleet"
        subtitle={`${rows.length} ${rows.length === 1 ? 'aircraft' : 'aircraft'} on the line.`}
        actions={
          <Link
            href="/admin/aircraft/new"
            style={{
              padding: '0.55rem 0.95rem',
              background: 'linear-gradient(180deg, #fbbf24 0%, #f59e0b 100%)',
              color: '#0a0e1a',
              borderRadius: 8,
              textDecoration: 'none',
              fontSize: '0.78rem',
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              boxShadow:
                '0 4px 14px rgba(251, 191, 36, 0.25), 0 1px 0 rgba(255, 255, 255, 0.15) inset',
            }}
          >
            + New Aircraft
          </Link>
        }
      />
      <AircraftTable rows={rows} />
    </main>
  );
}
