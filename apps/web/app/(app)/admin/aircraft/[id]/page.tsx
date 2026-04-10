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
    <main style={{ padding: '1rem', maxWidth: 1100 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '1rem', flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0 }}>
          {row.tailNumber}{' '}
          <span style={{ fontSize: '1rem', color: '#555' }}>
            {row.make} {row.model} {row.year ? `(${row.year})` : ''}
          </span>
        </h1>
        <Link
          href={`/fleet-map/replay/${encodeURIComponent(row.tailNumber)}`}
          style={{
            fontSize: '0.85rem',
            color: '#3b82f6',
            textDecoration: 'none',
            fontWeight: 500,
            whiteSpace: 'nowrap',
          }}
        >
          View last flight &rarr;
        </Link>
      </div>
      <section
        style={{
          display: 'flex',
          gap: '2rem',
          padding: '1rem',
          background: '#f7f7f7',
          borderRadius: 6,
          margin: '1rem 0',
        }}
      >
        <div>
          <div style={{ fontSize: '0.8rem', color: '#555' }}>Hobbs</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 'bold' }}>{fmt(totals?.currentHobbs)}</div>
        </div>
        <div>
          <div style={{ fontSize: '0.8rem', color: '#555' }}>Tach</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 'bold' }}>{fmt(totals?.currentTach)}</div>
        </div>
        <div>
          <div style={{ fontSize: '0.8rem', color: '#555' }}>Airframe</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 'bold' }}>
            {fmt(totals?.currentAirframe)}
          </div>
        </div>
      </section>

      <EditAircraftForm
        aircraftId={id}
        initial={{
          tailNumber: row.tailNumber,
          make: row.make ?? '',
          model: row.model ?? '',
          year: row.year ?? null,
          equipmentNotes: row.equipmentNotes ?? '',
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
