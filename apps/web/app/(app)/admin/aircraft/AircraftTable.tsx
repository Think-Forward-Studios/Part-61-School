'use client';
import Link from 'next/link';

export interface AircraftRow {
  id: string;
  tailNumber: string;
  make: string | null;
  model: string | null;
  year: number | null;
  baseId: string;
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

export function AircraftTable({ rows }: { rows: AircraftRow[] }) {
  if (rows.length === 0) {
    return (
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
        No aircraft in your fleet yet.
      </div>
    );
  }
  return (
    <div
      style={{
        background: '#0d1220',
        border: '1px solid #1f2940',
        borderRadius: 12,
        overflow: 'hidden',
      }}
    >
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
        <thead>
          <tr style={{ background: '#121826' }}>
            <th style={TH}>Tail #</th>
            <th style={TH}>Make</th>
            <th style={TH}>Model</th>
            <th style={TH}>Year</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} style={{ borderBottom: '1px solid #161d30' }}>
              <td style={TD}>
                <Link
                  href={`/admin/aircraft/${r.id}`}
                  style={{
                    color: '#f7f9fc',
                    textDecoration: 'none',
                    fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                    fontWeight: 600,
                    letterSpacing: '0.04em',
                  }}
                >
                  {r.tailNumber}
                </Link>
              </td>
              <td style={TD}>{r.make ?? <span style={{ color: '#5b6784' }}>—</span>}</td>
              <td style={TD}>{r.model ?? <span style={{ color: '#5b6784' }}>—</span>}</td>
              <td style={TD}>{r.year ?? <span style={{ color: '#5b6784' }}>—</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
