/**
 * /flight-log — student self-serve chronological flight log (STU-03).
 *
 * Read-only. Scoped to caller. Groups rows by year-month with totals
 * header driven by user_flight_log_totals view.
 */
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { sql } from 'drizzle-orm';
import { db } from '@part61/db';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { loadIacraTotals, minutesToHours } from '@/lib/trainingRecord';

export const dynamic = 'force-dynamic';

type FlightRow = {
  id: string;
  created_at: string;
  kind: string;
  day_minutes: number;
  night_minutes: number;
  cross_country_minutes: number;
  instrument_actual_minutes: number;
  instrument_simulated_minutes: number;
  day_landings: number;
  night_landings: number;
  is_simulator: boolean;
  time_in_make_model: string | null;
  notes: string | null;
};

function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

export default async function FlightLogPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const rows = (await db.execute(sql`
    select id, created_at, kind, day_minutes, night_minutes,
      cross_country_minutes, instrument_actual_minutes, instrument_simulated_minutes,
      day_landings, night_landings, is_simulator, time_in_make_model, notes
    from public.flight_log_time
    where user_id = ${user.id}::uuid
      and deleted_at is null
    order by created_at desc
  `)) as unknown as FlightRow[];

  const totals = await loadIacraTotals(user.id, '');

  const groups = new Map<string, FlightRow[]>();
  for (const r of rows) {
    const k = monthKey(r.created_at);
    const arr = groups.get(k) ?? [];
    arr.push(r);
    groups.set(k, arr);
  }
  const orderedKeys = Array.from(groups.keys()).sort().reverse();

  return (
    <main style={{ padding: '1rem', maxWidth: 1100 }}>
      <p>
        <Link href="/record">← Back to My Training Record</Link>
      </p>
      <h1>My Flight Log</h1>

      <section
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.75rem',
          background: '#f4f4f4',
          padding: '0.75rem',
          borderRadius: 6,
          marginBottom: '0.75rem',
          fontSize: '0.85rem',
        }}
      >
        <div>
          <strong>Total:</strong> {minutesToHours(totals.totalMinutes)} h
        </div>
        <div>
          <strong>PIC:</strong> {minutesToHours(totals.picMinutes)} h
        </div>
        <div>
          <strong>Dual recv:</strong> {minutesToHours(totals.dualReceivedMinutes)} h
        </div>
        <div>
          <strong>Solo:</strong> {minutesToHours(totals.soloMinutes)} h
        </div>
        <div>
          <strong>XC:</strong> {minutesToHours(totals.crossCountryMinutes)} h
        </div>
        <div>
          <strong>Night:</strong> {minutesToHours(totals.nightMinutes)} h
        </div>
        <div>
          <strong>Inst act:</strong> {minutesToHours(totals.instrumentActualMinutes)} h
        </div>
        <div>
          <strong>Inst sim:</strong> {minutesToHours(totals.instrumentSimulatedMinutes)} h
        </div>
        <div>
          <strong>Day ldg:</strong> {totals.dayLandings}
        </div>
        <div>
          <strong>Night ldg:</strong> {totals.nightLandings}
        </div>
      </section>

      <p style={{ fontSize: '0.9rem' }}>
        <a
          href="/flight-log/iacra.pdf"
          target="_blank"
          rel="noreferrer"
          style={{
            display: 'inline-block',
            padding: '0.4rem 0.6rem',
            background: '#2563eb',
            color: '#fff',
            borderRadius: 4,
            textDecoration: 'none',
            marginRight: '0.5rem',
          }}
        >
          Download IACRA PDF
        </a>
        <a
          href="/flight-log/iacra.csv"
          style={{
            display: 'inline-block',
            padding: '0.4rem 0.6rem',
            background: '#059669',
            color: '#fff',
            borderRadius: 4,
            textDecoration: 'none',
          }}
        >
          Download IACRA CSV
        </a>
      </p>

      {orderedKeys.length === 0 ? (
        <p style={{ color: '#888' }}>No flight time recorded yet.</p>
      ) : (
        orderedKeys.map((key) => {
          const bucket = groups.get(key) ?? [];
          return (
            <section key={key} style={{ marginTop: '1rem' }}>
              <h3 style={{ borderBottom: '1px solid #ccc', paddingBottom: 4 }}>{key}</h3>
              <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#eee', textAlign: 'left' }}>
                    <th>Date</th>
                    <th>Kind</th>
                    <th>Make/Model</th>
                    <th style={{ textAlign: 'right' }}>Day</th>
                    <th style={{ textAlign: 'right' }}>Night</th>
                    <th style={{ textAlign: 'right' }}>XC</th>
                    <th style={{ textAlign: 'right' }}>Inst</th>
                    <th style={{ textAlign: 'right' }}>Ldg</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {bucket.map((r) => (
                    <tr key={r.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                      <td>{new Date(r.created_at).toLocaleDateString()}</td>
                      <td>
                        {r.kind}
                        {r.is_simulator ? ' (sim)' : ''}
                      </td>
                      <td>{r.time_in_make_model ?? '—'}</td>
                      <td style={{ textAlign: 'right' }}>
                        {minutesToHours(r.day_minutes)}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {minutesToHours(r.night_minutes)}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {minutesToHours(r.cross_country_minutes)}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {minutesToHours(
                          r.instrument_actual_minutes + r.instrument_simulated_minutes,
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {r.day_landings + r.night_landings}
                      </td>
                      <td>{r.notes ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          );
        })
      )}
    </main>
  );
}
