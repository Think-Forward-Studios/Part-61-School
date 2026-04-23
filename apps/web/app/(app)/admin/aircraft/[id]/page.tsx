import { and, desc, eq } from 'drizzle-orm';
import { notFound, redirect } from 'next/navigation';
import {
  db,
  users,
  aircraft,
  aircraftEngine,
  aircraftEquipment,
  flightLogEntry,
  aircraftCurrentTotals,
  schools,
} from '@part61/db';
import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { EditAircraftForm } from './EditAircraftForm';
import { EnginesPanel } from './EnginesPanel';
import { EquipmentPanel } from './EquipmentPanel';
import { PhotoPanel } from './PhotoPanel';
import { RecentFlightsPanel } from './RecentFlightsPanel';
import { FlightLogEntryForm } from './FlightLogEntryForm';
import { MaintenancePanel } from './MaintenancePanel';
import { sql } from 'drizzle-orm';
import { PageHeader } from '@/components/ui';

export const dynamic = 'force-dynamic';

type Params = Promise<{ id: string }>;

function fmt(x: string | number | null | undefined): string {
  if (x == null) return '—';
  return Number(x).toFixed(1);
}

export default async function AircraftDetailPage({ params }: { params: Params }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const me = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  const schoolId = me[0]?.schoolId;
  if (!schoolId) redirect('/login');

  const row = (
    await db
      .select()
      .from(aircraft)
      .where(and(eq(aircraft.id, id), eq(aircraft.schoolId, schoolId)))
      .limit(1)
  )[0];
  if (!row) notFound();

  const totals = (
    await db
      .select()
      .from(aircraftCurrentTotals)
      .where(eq(aircraftCurrentTotals.aircraftId, id))
      .limit(1)
  )[0];

  const engines = await db.select().from(aircraftEngine).where(eq(aircraftEngine.aircraftId, id));

  const equipment = await db
    .select()
    .from(aircraftEquipment)
    .where(eq(aircraftEquipment.aircraftId, id));

  // School's home airport — surfaced on the edit form as the
  // fallback that applies when this aircraft's own home_airport
  // override is blank.
  const schoolRow = (
    await db
      .select({
        homeBaseAirport: schools.homeBaseAirport,
        homeBaseAirportName: schools.homeBaseAirportName,
      })
      .from(schools)
      .where(eq(schools.id, schoolId))
      .limit(1)
  )[0];

  // IA authority check: does this user have any user_roles row with mechanic_authority='ia'?
  const iaRows = (await db.execute(sql`
    select 1 from public.user_roles
     where user_id = ${user.id}::uuid and mechanic_authority = 'ia'
     limit 1
  `)) as unknown as Array<Record<string, unknown>>;
  const canRequestOverrun = iaRows.length > 0;

  const recentFlights = await db
    .select()
    .from(flightLogEntry)
    .where(eq(flightLogEntry.aircraftId, id))
    .orderBy(desc(flightLogEntry.flownAt))
    .limit(25);

  return (
    <main style={{ padding: '0 1.5rem 2rem', maxWidth: 1300, margin: '0 auto' }}>
      <PageHeader
        eyebrow="Maintenance"
        title={row.tailNumber}
        subtitle={`${row.make ?? ''} ${row.model ?? ''}${row.year ? ` (${row.year})` : ''}`.trim()}
        actions={
          <Link
            href={`/fleet-map/replay/${encodeURIComponent(row.tailNumber)}`}
            style={{
              padding: '0.35rem 0.8rem',
              background: 'rgba(56, 189, 248, 0.12)',
              color: '#38bdf8',
              border: '1px solid rgba(56, 189, 248, 0.35)',
              borderRadius: 6,
              textDecoration: 'none',
              fontSize: '0.72rem',
              fontFamily: '"JetBrains Mono", ui-monospace, monospace',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              fontWeight: 600,
              whiteSpace: 'nowrap',
            }}
          >
            View last flight &rarr;
          </Link>
        }
      />
      <section
        style={{
          display: 'flex',
          gap: '2rem',
          padding: '1rem 1.25rem',
          background: '#0d1220',
          border: '1px solid #1f2940',
          borderRadius: 12,
          margin: '0 0 1rem',
        }}
      >
        <div>
          <div
            style={{
              fontSize: '0.68rem',
              color: '#7a869a',
              fontFamily: '"JetBrains Mono", ui-monospace, monospace',
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
            }}
          >
            Hobbs
          </div>
          <div
            style={{
              fontSize: '1.4rem',
              fontWeight: 700,
              color: '#f7f9fc',
              fontFamily: '"JetBrains Mono", ui-monospace, monospace',
            }}
          >
            {fmt(totals?.currentHobbs)}
          </div>
        </div>
        <div>
          <div
            style={{
              fontSize: '0.68rem',
              color: '#7a869a',
              fontFamily: '"JetBrains Mono", ui-monospace, monospace',
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
            }}
          >
            Tach
          </div>
          <div
            style={{
              fontSize: '1.4rem',
              fontWeight: 700,
              color: '#f7f9fc',
              fontFamily: '"JetBrains Mono", ui-monospace, monospace',
            }}
          >
            {fmt(totals?.currentTach)}
          </div>
        </div>
        <div>
          <div
            style={{
              fontSize: '0.68rem',
              color: '#7a869a',
              fontFamily: '"JetBrains Mono", ui-monospace, monospace',
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
            }}
          >
            Airframe
          </div>
          <div
            style={{
              fontSize: '1.4rem',
              fontWeight: 700,
              color: '#f7f9fc',
              fontFamily: '"JetBrains Mono", ui-monospace, monospace',
            }}
          >
            {fmt(totals?.currentAirframe)}
          </div>
        </div>
      </section>

      <EditAircraftForm
        aircraftId={id}
        schoolHomeAirport={schoolRow?.homeBaseAirport?.trim() || null}
        schoolHomeAirportName={schoolRow?.homeBaseAirportName?.trim() || null}
        initial={{
          tailNumber: row.tailNumber,
          make: row.make ?? '',
          model: row.model ?? '',
          year: row.year ?? null,
          equipmentNotes: row.equipmentNotes ?? '',
          homeAirport: row.homeAirport ?? '',
        }}
      />

      <MaintenancePanel
        aircraftId={id}
        tailNumber={row.tailNumber}
        groundedAt={row.groundedAt ? row.groundedAt.toISOString() : null}
        groundedReason={row.groundedReason ?? null}
        groundedByItemId={row.groundedByItemId ?? null}
        canRequestOverrun={canRequestOverrun}
      />

      <EnginesPanel
        aircraftId={id}
        engines={engines.map((e) => ({
          id: e.id,
          position: e.position,
          serialNumber: e.serialNumber,
          removedAt: e.removedAt ? e.removedAt.toISOString() : null,
        }))}
      />

      <EquipmentPanel aircraftId={id} initialTags={equipment.map((e) => e.tag)} />

      <PhotoPanel aircraftId={id} />

      <FlightLogEntryForm
        aircraftId={id}
        engines={engines.map((e) => ({ id: e.id, position: e.position }))}
      />

      <RecentFlightsPanel
        flights={recentFlights.map((f) => ({
          id: f.id,
          kind: f.kind,
          flownAt: f.flownAt.toISOString(),
          hobbsOut: f.hobbsOut,
          hobbsIn: f.hobbsIn,
          tachOut: f.tachOut,
          tachIn: f.tachIn,
          airframeDelta: f.airframeDelta,
          correctsId: f.correctsId,
          notes: f.notes,
        }))}
      />
    </main>
  );
}
