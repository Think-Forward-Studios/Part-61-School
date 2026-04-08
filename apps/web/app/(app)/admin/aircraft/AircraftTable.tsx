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

export function AircraftTable({ rows }: { rows: AircraftRow[] }) {
  if (rows.length === 0) {
    return <p style={{ color: '#888', marginTop: '1rem' }}>No aircraft in your fleet yet.</p>;
  }
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '1rem' }}>
      <thead>
        <tr style={{ textAlign: 'left', borderBottom: '2px solid #ddd' }}>
          <th style={{ padding: '0.5rem' }}>Tail #</th>
          <th style={{ padding: '0.5rem' }}>Make</th>
          <th style={{ padding: '0.5rem' }}>Model</th>
          <th style={{ padding: '0.5rem' }}>Year</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} style={{ borderBottom: '1px solid #eee' }}>
            <td style={{ padding: '0.5rem' }}>
              <Link href={`/admin/aircraft/${r.id}`}>{r.tailNumber}</Link>
            </td>
            <td style={{ padding: '0.5rem' }}>{r.make ?? '—'}</td>
            <td style={{ padding: '0.5rem' }}>{r.model ?? '—'}</td>
            <td style={{ padding: '0.5rem' }}>{r.year ?? '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
