'use client';

import * as s from './_panelStyles';

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

function kindPalette(kind: string): { bg: string; fg: string; border: string } {
  if (kind === 'correction') {
    return {
      bg: 'rgba(251, 191, 36, 0.14)',
      fg: '#fbbf24',
      border: 'rgba(251, 191, 36, 0.4)',
    };
  }
  if (kind === 'baseline') {
    return {
      bg: 'rgba(56, 189, 248, 0.14)',
      fg: '#7dd3fc',
      border: 'rgba(56, 189, 248, 0.4)',
    };
  }
  // flight / flight_in / flight_out
  return {
    bg: 'rgba(52, 211, 153, 0.14)',
    fg: '#6ee7b7',
    border: 'rgba(52, 211, 153, 0.4)',
  };
}

export function RecentFlightsPanel({ flights }: { flights: FlightRow[] }) {
  return (
    <section style={s.section}>
      <h2 style={s.heading}>Recent Flights</h2>

      {flights.length === 0 ? (
        <p style={s.emptyText}>No flights logged yet.</p>
      ) : (
        <div
          style={{
            marginTop: '0.75rem',
            overflow: 'hidden',
            borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.05)',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
            <thead>
              <tr
                style={{
                  background: 'rgba(9, 13, 24, 0.6)',
                  color: '#7a869a',
                  textAlign: 'left',
                  fontSize: '0.66rem',
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                }}
              >
                <th style={thStyle}>When</th>
                <th style={thStyle}>Kind</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Hobbs out</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Hobbs in</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Tach out</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Tach in</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Airframe</th>
                <th style={thStyle}>Notes</th>
              </tr>
            </thead>
            <tbody>
              {flights.map((f) => {
                const pal = kindPalette(f.kind);
                return (
                  <tr key={f.id} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ ...tdStyle, color: '#cbd5e1', whiteSpace: 'nowrap' }}>
                      {new Date(f.flownAt).toLocaleString()}
                    </td>
                    <td style={tdStyle}>
                      <span
                        title={
                          f.kind === 'correction' && f.correctsId
                            ? `Corrects ${f.correctsId}`
                            : undefined
                        }
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '0.1rem 0.45rem',
                          background: pal.bg,
                          border: `1px solid ${pal.border}`,
                          color: pal.fg,
                          borderRadius: 999,
                          fontSize: '0.62rem',
                          fontWeight: 700,
                          letterSpacing: '0.1em',
                          textTransform: 'uppercase',
                          fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                        }}
                      >
                        {f.kind === 'correction' ? '↳ correction' : f.kind}
                      </span>
                    </td>
                    <td style={{ ...tdMonoRight }}>{fmt(f.hobbsOut)}</td>
                    <td style={{ ...tdMonoRight }}>{fmt(f.hobbsIn)}</td>
                    <td style={{ ...tdMonoRight }}>{fmt(f.tachOut)}</td>
                    <td style={{ ...tdMonoRight }}>{fmt(f.tachIn)}</td>
                    <td style={{ ...tdMonoRight }}>{fmt(f.airframeDelta)}</td>
                    <td style={{ ...tdStyle, color: '#94a3b8' }}>{f.notes ?? ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

const thStyle: React.CSSProperties = {
  padding: '0.55rem 0.85rem',
  fontWeight: 600,
};

const tdStyle: React.CSSProperties = {
  padding: '0.6rem 0.85rem',
  color: '#e2e8f0',
};

const tdMonoRight: React.CSSProperties = {
  ...tdStyle,
  textAlign: 'right',
  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
  fontSize: '0.8rem',
};
