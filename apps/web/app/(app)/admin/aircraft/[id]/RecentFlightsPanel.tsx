'use client';

interface FlightRow {
  id: string;
  kind: string;
  flownAt: string;
  hobbsOut: string | null;
  hobbsIn: string | null;
  tachOut: string | null;
  tachIn: string | null;
  airframeDelta: string;
  correctsId: string | null;
  notes: string | null;
}

function fmt(v: string | null): string {
  if (v == null) return '—';
  return Number(v).toFixed(1);
}

export function RecentFlightsPanel({ flights }: { flights: FlightRow[] }) {
  return (
    <section style={{ marginTop: '1rem', padding: '1rem', border: '1px solid #ddd', borderRadius: 6 }}>
      <h2>Recent Flights</h2>
      {flights.length === 0 ? (
        <p style={{ color: '#888' }}>No flights logged yet.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #ddd', textAlign: 'left' }}>
              <th>When</th>
              <th>Kind</th>
              <th>Hobbs out</th>
              <th>Hobbs in</th>
              <th>Tach out</th>
              <th>Tach in</th>
              <th>Airframe</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {flights.map((f) => (
              <tr
                key={f.id}
                style={{
                  borderBottom: '1px solid #eee',
                  background: f.kind === 'correction' ? '#fffbe6' : undefined,
                }}
              >
                <td>{new Date(f.flownAt).toLocaleString()}</td>
                <td>
                  {f.kind === 'correction' && f.correctsId ? (
                    <span title={`corrects ${f.correctsId}`}>↳ correction</span>
                  ) : (
                    f.kind
                  )}
                </td>
                <td>{fmt(f.hobbsOut)}</td>
                <td>{fmt(f.hobbsIn)}</td>
                <td>{fmt(f.tachOut)}</td>
                <td>{fmt(f.tachIn)}</td>
                <td>{fmt(f.airframeDelta)}</td>
                <td>{f.notes ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
