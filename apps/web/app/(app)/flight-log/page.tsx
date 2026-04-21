/**
 * /flight-log — student self-serve chronological flight log (STU-03).
 *
 * Read-only. Scoped to caller. Groups rows by year-month with totals
 * header driven by user_flight_log_totals view.
 */
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { sql } from 'drizzle-orm';
import { db } from '@part61/db';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { loadIacraTotals, minutesToHours } from '@/lib/trainingRecord';
import { PageHeader } from '@/components/ui';

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

const TH: React.CSSProperties = {
  textAlign: 'left',
  padding: '0.65rem 0.9rem',
  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
  fontSize: '0.68rem',
  letterSpacing: '0.15em',
  color: '#7a869a',
  textTransform: 'uppercase',
  fontWeight: 500,
  borderBottom: '1px solid #1f2940',
};

const TD: React.CSSProperties = {
  padding: '0.7rem 0.9rem',
  color: '#cbd5e1',
  fontSize: '0.82rem',
};

export default async function FlightLogPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const cookieStore = await cookies();
  const activeRole = cookieStore.get('part61.active_role')?.value;

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

  const totalChips: Array<{ label: string; value: string }> = [
    { label: 'Total', value: `${minutesToHours(totals.totalMinutes)} h` },
    { label: 'PIC', value: `${minutesToHours(totals.picMinutes)} h` },
    { label: 'Dual recv', value: `${minutesToHours(totals.dualReceivedMinutes)} h` },
    { label: 'Solo', value: `${minutesToHours(totals.soloMinutes)} h` },
    { label: 'XC', value: `${minutesToHours(totals.crossCountryMinutes)} h` },
    { label: 'Night', value: `${minutesToHours(totals.nightMinutes)} h` },
    { label: 'Inst act', value: `${minutesToHours(totals.instrumentActualMinutes)} h` },
    { label: 'Inst sim', value: `${minutesToHours(totals.instrumentSimulatedMinutes)} h` },
    { label: 'Day ldg', value: String(totals.dayLandings) },
    { label: 'Night ldg', value: String(totals.nightLandings) },
  ];

  const subtitle =
    activeRole === 'admin'
      ? 'Personal flight log for the signed-in account — RLS-scoped to you, not a school-wide view. For fleet or instructor utilization across the whole school, see Reports → Fleet Utilization and Reports → Instructor Utilization. The IACRA PDF/CSV exports here are formatted for an FAA 8710-1 (Airman Certificate and/or Rating Application) and are intended for rated pilots assembling their own application.'
      : activeRole === 'instructor'
        ? 'Your chronological flight time, grouped by month. Totals include dual given + PIC hours and match the FAA IACRA 8710-1 format — use the PDF or CSV export when preparing an application for a new rating (e.g. CFII, MEI).'
        : 'Your chronological flight time, grouped by month. Totals match the FAA IACRA 8710-1 (Airman Certificate and/or Rating Application) format. Use the PDF or CSV export when preparing an application for a new certificate or rating.';

  return (
    <main style={{ padding: '0 1.5rem 2rem', maxWidth: 1200, margin: '0 auto' }}>
      <PageHeader
        eyebrow="Operations"
        title="Flight Log"
        subtitle={subtitle}
        actions={
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <a
              href="/flight-log/iacra.pdf"
              target="_blank"
              rel="noreferrer"
              style={{
                padding: '0.45rem 0.9rem',
                background: 'linear-gradient(180deg, #fbbf24 0%, #f59e0b 100%)',
                color: '#0a0e1a',
                borderRadius: 8,
                textDecoration: 'none',
                fontSize: '0.72rem',
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                boxShadow:
                  '0 4px 14px rgba(251, 191, 36, 0.25), 0 1px 0 rgba(255, 255, 255, 0.15) inset',
              }}
            >
              IACRA PDF
            </a>
            <a
              href="/flight-log/iacra.csv"
              style={{
                padding: '0.45rem 0.9rem',
                background: 'rgba(52, 211, 153, 0.12)',
                color: '#34d399',
                border: '1px solid rgba(52, 211, 153, 0.35)',
                borderRadius: 8,
                textDecoration: 'none',
                fontSize: '0.72rem',
                fontWeight: 600,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                fontFamily: '"JetBrains Mono", ui-monospace, monospace',
              }}
            >
              IACRA CSV
            </a>
          </div>
        }
      />

      <section
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.75rem',
          background: '#0d1220',
          border: '1px solid #1f2940',
          padding: '0.85rem 1rem',
          borderRadius: 12,
          marginBottom: '1rem',
          fontSize: '0.85rem',
        }}
      >
        {totalChips.map((chip) => (
          <div
            key={chip.label}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.15rem',
              padding: '0.25rem 0.65rem',
              borderRight: '1px solid #1a2238',
              minWidth: 80,
            }}
          >
            <span
              style={{
                fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                fontSize: '0.6rem',
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
                color: '#7a869a',
              }}
            >
              {chip.label}
            </span>
            <span style={{ color: '#f7f9fc', fontWeight: 600 }}>{chip.value}</span>
          </div>
        ))}
      </section>

      {orderedKeys.length === 0 ? (
        <div
          style={{
            padding: '3rem 1rem',
            textAlign: 'center',
            color: '#7a869a',
            fontSize: '0.88rem',
            background: '#0d1220',
            border: '1px dashed #1f2940',
            borderRadius: 12,
          }}
        >
          No flight time recorded yet.
        </div>
      ) : (
        orderedKeys.map((key) => {
          const bucket = groups.get(key) ?? [];
          return (
            <section key={key} style={{ marginTop: '1.5rem' }}>
              <h3
                style={{
                  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                  fontSize: '0.72rem',
                  letterSpacing: '0.2em',
                  textTransform: 'uppercase',
                  color: '#7a869a',
                  marginBottom: '0.5rem',
                  fontWeight: 500,
                }}
              >
                {key}
              </h3>
              <div
                style={{
                  background: '#0d1220',
                  border: '1px solid #1f2940',
                  borderRadius: 12,
                  overflow: 'hidden',
                }}
              >
                <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#121826' }}>
                      <th style={TH}>Date</th>
                      <th style={TH}>Kind</th>
                      <th style={TH}>Make/Model</th>
                      <th style={{ ...TH, textAlign: 'right' }}>Day</th>
                      <th style={{ ...TH, textAlign: 'right' }}>Night</th>
                      <th style={{ ...TH, textAlign: 'right' }}>XC</th>
                      <th style={{ ...TH, textAlign: 'right' }}>Inst</th>
                      <th style={{ ...TH, textAlign: 'right' }}>Ldg</th>
                      <th style={TH}>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bucket.map((r) => (
                      <tr key={r.id} style={{ borderBottom: '1px solid #161d30' }}>
                        <td style={TD}>{new Date(r.created_at).toLocaleDateString()}</td>
                        <td style={TD}>
                          {r.kind}
                          {r.is_simulator ? ' (sim)' : ''}
                        </td>
                        <td style={TD}>
                          {r.time_in_make_model ?? <span style={{ color: '#5b6784' }}>—</span>}
                        </td>
                        <td style={{ ...TD, textAlign: 'right' }}>
                          {minutesToHours(r.day_minutes)}
                        </td>
                        <td style={{ ...TD, textAlign: 'right' }}>
                          {minutesToHours(r.night_minutes)}
                        </td>
                        <td style={{ ...TD, textAlign: 'right' }}>
                          {minutesToHours(r.cross_country_minutes)}
                        </td>
                        <td style={{ ...TD, textAlign: 'right' }}>
                          {minutesToHours(
                            r.instrument_actual_minutes + r.instrument_simulated_minutes,
                          )}
                        </td>
                        <td style={{ ...TD, textAlign: 'right' }}>
                          {r.day_landings + r.night_landings}
                        </td>
                        <td style={TD}>{r.notes ?? <span style={{ color: '#5b6784' }}>—</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })
      )}
    </main>
  );
}
