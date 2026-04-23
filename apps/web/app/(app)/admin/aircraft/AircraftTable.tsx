'use client';
import Link from 'next/link';

export interface AircraftRow {
  id: string;
  tailNumber: string;
  make: string | null;
  model: string | null;
  year: number | null;
  baseName: string | null;
  grounded: boolean;
  airworthy: boolean;
  currentHobbs: number;
  currentTach: number;
  currentAirframe: number;
  lastFlownAt: string | null;
  nextDueAt: string | null;
  nextDueTitle: string | null;
}

const TH: React.CSSProperties = {
  textAlign: 'left',
  padding: '0.6rem 0.9rem',
  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
  fontSize: '0.66rem',
  letterSpacing: '0.15em',
  color: '#7a869a',
  textTransform: 'uppercase',
  fontWeight: 500,
  borderBottom: '1px solid #1f2940',
  whiteSpace: 'nowrap',
};

const TD: React.CSSProperties = {
  padding: '0.65rem 0.9rem',
  color: '#cbd5e1',
  fontSize: '0.82rem',
  verticalAlign: 'middle',
};

const MONO: React.CSSProperties = {
  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
  fontSize: '0.8rem',
  color: '#e2e8f0',
};

/** Human "x days" phrasing for next-due + last-flown columns. */
function relativeDays(iso: string | null): {
  label: string;
  tone: 'ok' | 'soon' | 'overdue' | 'neutral';
} {
  if (!iso) return { label: '—', tone: 'neutral' };
  const then = new Date(iso).getTime();
  const now = Date.now();
  const days = Math.round((then - now) / 86400_000);
  if (days < 0) {
    return {
      label: `${Math.abs(days)}d overdue`,
      tone: 'overdue',
    };
  }
  if (days === 0) return { label: 'today', tone: 'soon' };
  if (days <= 14) return { label: `${days}d`, tone: 'soon' };
  return { label: `${days}d`, tone: 'ok' };
}

function daysAgo(iso: string | null): string {
  if (!iso) return 'never';
  const then = new Date(iso).getTime();
  const now = Date.now();
  const days = Math.round((now - then) / 86400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function StatusChip({ airworthy, grounded }: { airworthy: boolean; grounded: boolean }) {
  let label = 'AIRWORTHY';
  let bg = 'rgba(52, 211, 153, 0.14)';
  let fg = '#6ee7b7';
  let border = 'rgba(52, 211, 153, 0.4)';
  if (grounded) {
    label = 'GROUNDED';
    bg = 'rgba(248, 113, 113, 0.14)';
    fg = '#fca5a5';
    border = 'rgba(248, 113, 113, 0.4)';
  } else if (!airworthy) {
    label = 'NOT AW';
    bg = 'rgba(251, 191, 36, 0.14)';
    fg = '#fbbf24';
    border = 'rgba(251, 191, 36, 0.4)';
  }
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '0.15rem 0.5rem',
        background: bg,
        border: `1px solid ${border}`,
        color: fg,
        borderRadius: 999,
        fontSize: '0.62rem',
        fontWeight: 700,
        letterSpacing: '0.1em',
        fontFamily: '"JetBrains Mono", ui-monospace, monospace',
      }}
    >
      {label}
    </span>
  );
}

function NextDueCell({ row }: { row: AircraftRow }) {
  if (!row.nextDueAt) {
    return <span style={{ color: '#5b6784' }}>—</span>;
  }
  const rel = relativeDays(row.nextDueAt);
  const color = rel.tone === 'overdue' ? '#fca5a5' : rel.tone === 'soon' ? '#fbbf24' : '#cbd5e1';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', minWidth: 0 }}>
      <span
        style={{
          color,
          fontFamily: '"JetBrains Mono", ui-monospace, monospace',
          fontSize: '0.76rem',
          fontWeight: 600,
          letterSpacing: '0.04em',
        }}
      >
        {new Date(row.nextDueAt).toLocaleDateString()} · {rel.label}
      </span>
      {row.nextDueTitle ? (
        <span
          style={{
            color: '#7a869a',
            fontSize: '0.72rem',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: 200,
          }}
        >
          {row.nextDueTitle}
        </span>
      ) : null}
    </div>
  );
}

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
        overflow: 'auto',
      }}
    >
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
        <thead>
          <tr style={{ background: '#121826' }}>
            <th style={TH}>Tail #</th>
            <th style={TH}>Aircraft</th>
            <th style={TH}>Base</th>
            <th style={TH}>Status</th>
            <th style={{ ...TH, textAlign: 'right' }}>Hobbs</th>
            <th style={{ ...TH, textAlign: 'right' }}>Tach</th>
            <th style={{ ...TH, textAlign: 'right' }}>Airframe</th>
            <th style={TH}>Last flown</th>
            <th style={TH}>Next due</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const makeModel = [r.make, r.model].filter(Boolean).join(' ') || '—';
            return (
              <tr key={r.id} style={{ borderBottom: '1px solid #161d30' }}>
                <td style={TD}>
                  <Link
                    href={`/admin/aircraft/${r.id}`}
                    style={{
                      color: '#fbbf24',
                      textDecoration: 'none',
                      fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                      fontWeight: 700,
                      letterSpacing: '0.04em',
                    }}
                  >
                    {r.tailNumber}
                  </Link>
                </td>
                <td style={TD}>
                  <div style={{ color: '#f7f9fc' }}>{makeModel}</div>
                  {r.year ? (
                    <div style={{ color: '#7a869a', fontSize: '0.72rem' }}>{r.year}</div>
                  ) : null}
                </td>
                <td style={TD}>{r.baseName ?? <span style={{ color: '#5b6784' }}>—</span>}</td>
                <td style={TD}>
                  <StatusChip airworthy={r.airworthy} grounded={r.grounded} />
                </td>
                <td style={{ ...TD, ...MONO, textAlign: 'right' }}>{r.currentHobbs.toFixed(1)}</td>
                <td style={{ ...TD, ...MONO, textAlign: 'right' }}>{r.currentTach.toFixed(1)}</td>
                <td style={{ ...TD, ...MONO, textAlign: 'right' }}>
                  {r.currentAirframe.toFixed(1)}
                </td>
                <td style={TD}>
                  <span style={{ color: r.lastFlownAt ? '#cbd5e1' : '#5b6784' }}>
                    {daysAgo(r.lastFlownAt)}
                  </span>
                </td>
                <td style={TD}>
                  <NextDueCell row={r} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
