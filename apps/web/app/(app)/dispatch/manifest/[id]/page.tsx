import { notFound, redirect } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import {
  db,
  users,
  reservation,
  passengerManifest,
  aircraft,
} from '@part61/db';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PrintButtonClient } from './PrintButtonClient';

export const dynamic = 'force-dynamic';

/**
 * /dispatch/manifest/[id] — print-friendly passenger manifest (FTR-06).
 *
 * Single-page A4/letter layout, large legible type, hides nav on
 * print. The "Print" button calls window.print() inline. No PDF
 * library — print-to-PDF from the browser is enough for v1.
 */
export default async function ManifestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const me = (
    await db.select().from(users).where(eq(users.id, user.id)).limit(1)
  )[0];
  if (!me) redirect('/login');

  const r = (
    await db
      .select()
      .from(reservation)
      .where(and(eq(reservation.id, id), eq(reservation.schoolId, me.schoolId)))
      .limit(1)
  )[0];
  if (!r) notFound();

  const pax = await db
    .select()
    .from(passengerManifest)
    .where(eq(passengerManifest.reservationId, id));

  let tail: string | null = null;
  if (r.aircraftId) {
    const ac = (
      await db
        .select({ tailNumber: aircraft.tailNumber })
        .from(aircraft)
        .where(eq(aircraft.id, r.aircraftId))
        .limit(1)
    )[0];
    tail = ac?.tailNumber ?? null;
  }

  const totalWeight = pax.reduce(
    (sum, p) => sum + (p.weightLbs ? Number(p.weightLbs) : 0),
    0,
  );

  return (
    <main
      style={{
        padding: '2rem',
        maxWidth: 800,
        margin: '0 auto',
        fontFamily: 'sans-serif',
      }}
    >
      <style>{`
        @media print {
          .no-print { display: none !important; }
          @page { size: letter; margin: 0.75in; }
          body { font-size: 12pt; }
        }
        .manifest-table { width: 100%; border-collapse: collapse; }
        .manifest-table th, .manifest-table td {
          border: 1px solid #333;
          padding: 0.5rem;
          text-align: left;
        }
        .manifest-table th { background: #f3f4f6; }
      `}</style>

      <div className="no-print" style={{ marginBottom: '1rem' }}>
        <PrintButtonClient />
      </div>

      <h1 style={{ borderBottom: '2px solid #000', paddingBottom: '0.5rem' }}>
        Passenger Manifest
      </h1>

      <table style={{ width: '100%', marginBottom: '1.5rem', fontSize: '1rem' }}>
        <tbody>
          <tr>
            <td style={{ width: '30%' }}>
              <strong>Reservation</strong>
            </td>
            <td>{r.id}</td>
          </tr>
          <tr>
            <td>
              <strong>Aircraft</strong>
            </td>
            <td>{tail ?? '—'}</td>
          </tr>
          <tr>
            <td>
              <strong>Activity</strong>
            </td>
            <td>{r.activityType}</td>
          </tr>
          <tr>
            <td>
              <strong>Status</strong>
            </td>
            <td>{r.status}</td>
          </tr>
          <tr>
            <td>
              <strong>Notes</strong>
            </td>
            <td>{r.notes ?? '—'}</td>
          </tr>
        </tbody>
      </table>

      <h2>Persons on board</h2>
      <table className="manifest-table">
        <thead>
          <tr>
            <th>Position</th>
            <th>Name</th>
            <th>Weight (lb)</th>
            <th>Emergency contact</th>
            <th>Phone</th>
          </tr>
        </thead>
        <tbody>
          {pax.length === 0 ? (
            <tr>
              <td colSpan={5} style={{ textAlign: 'center', color: '#888' }}>
                No persons on manifest
              </td>
            </tr>
          ) : (
            pax.map((p) => (
              <tr key={p.id}>
                <td>{p.position.toUpperCase()}</td>
                <td>{p.name}</td>
                <td>{p.weightLbs ?? '—'}</td>
                <td>{p.emergencyContactName ?? '—'}</td>
                <td>{p.emergencyContactPhone ?? '—'}</td>
              </tr>
            ))
          )}
        </tbody>
        <tfoot>
          <tr>
            <th colSpan={2} style={{ textAlign: 'right' }}>
              Total weight
            </th>
            <th>{totalWeight.toFixed(0)}</th>
            <th colSpan={2} />
          </tr>
        </tfoot>
      </table>

      <p style={{ marginTop: '2rem', fontSize: '0.85rem', color: '#666' }}>
        Generated {new Date().toLocaleString()}
      </p>
    </main>
  );
}

