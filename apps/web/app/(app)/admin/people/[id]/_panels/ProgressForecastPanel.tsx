'use client';

/**
 * ProgressForecastPanel — ahead/behind indicator + projected dates (SYL-22/23).
 *
 * Fetches admin.enrollments.getProgressForecast and renders a status chip,
 * projected checkride/completion dates, and confidence level.
 */

import { trpc } from '@/lib/trpc/client';

const H2: React.CSSProperties = {
  fontSize: '0.72rem',
  margin: '0 0 0.6rem',
  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
  color: '#7a869a',
  textTransform: 'uppercase',
  letterSpacing: '0.15em',
  fontWeight: 500,
};

function chipStyle(weeks: number): { bg: string; fg: string } {
  if (weeks > 0) return { bg: 'rgba(52, 211, 153, 0.12)', fg: '#34d399' };
  if (weeks >= -1) return { bg: 'rgba(122, 134, 154, 0.14)', fg: '#cbd5e1' };
  if (weeks >= -2) return { bg: 'rgba(251, 191, 36, 0.14)', fg: '#fbbf24' };
  return { bg: 'rgba(248, 113, 113, 0.14)', fg: '#f87171' };
}

function chipText(weeks: number): string {
  if (Math.abs(weeks) < 0.1) return 'On plan';
  if (weeks > 0) return `Ahead by ${weeks.toFixed(1)} weeks`;
  return `Behind by ${Math.abs(weeks).toFixed(1)} weeks`;
}

function fmtDate(val: unknown): string {
  if (!val) return '--';
  const d = new Date(String(val));
  if (isNaN(d.getTime())) return '--';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function ProgressForecastPanel({ enrollmentId }: { enrollmentId: string }) {
  const utils = trpc.useUtils();
  const query = trpc.admin.enrollments.getProgressForecast.useQuery({ enrollmentId });

  if (query.isLoading) {
    return (
      <section style={{ marginTop: '1.5rem' }}>
        <h2 style={H2}>Progress forecast</h2>
        <p style={{ color: '#5b6784', fontSize: '0.85rem', margin: 0 }}>Loading forecast...</p>
      </section>
    );
  }

  if (!query.data) {
    return (
      <section style={{ marginTop: '1.5rem' }}>
        <h2 style={H2}>Progress forecast</h2>
        <p style={{ color: '#7a869a', fontSize: '0.85rem', margin: 0 }}>
          No forecast data available.
        </p>
      </section>
    );
  }

  const data = query.data as Record<string, unknown>;
  const aheadBehindWeeks = Number(data.ahead_behind_weeks ?? 0);
  const projectedCheckride = data.projected_checkride_date;
  const projectedCompletion = data.projected_completion_date;
  const confidence = String(data.confidence ?? 'low');
  const weeksEnrolled = Number(data.weeks_enrolled ?? 0);

  const chip = chipStyle(aheadBehindWeeks);

  return (
    <section style={{ marginTop: '1.5rem' }}>
      <h2 style={H2}>Progress forecast</h2>

      <div
        style={{
          display: 'inline-block',
          padding: '0.4rem 0.9rem',
          borderRadius: 6,
          background: chip.bg,
          color: chip.fg,
          fontWeight: 600,
          fontSize: '0.78rem',
          fontFamily: '"JetBrains Mono", ui-monospace, monospace',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}
      >
        {chipText(aheadBehindWeeks)}
      </div>

      <div
        style={{
          marginTop: '0.75rem',
          fontSize: '0.88rem',
          color: '#cbd5e1',
          display: 'grid',
          gap: '0.35rem',
        }}
      >
        <div>
          Projected checkride:{' '}
          <strong
            style={{ color: '#f7f9fc', fontFamily: '"JetBrains Mono", ui-monospace, monospace' }}
          >
            {fmtDate(projectedCheckride)}
          </strong>
        </div>
        <div>
          Projected course completion:{' '}
          <strong
            style={{ color: '#f7f9fc', fontFamily: '"JetBrains Mono", ui-monospace, monospace' }}
          >
            {fmtDate(projectedCompletion)}
          </strong>
        </div>
      </div>

      <div style={{ marginTop: '0.5rem', fontSize: '0.78rem', color: '#7a869a' }}>
        Confidence: {confidence} ({weeksEnrolled.toFixed(0)} weeks enrolled)
      </div>

      <button
        type="button"
        onClick={() => {
          void utils.admin.enrollments.getProgressForecast.invalidate({ enrollmentId });
        }}
        style={{
          marginTop: '0.6rem',
          fontSize: '0.68rem',
          padding: '0.35rem 0.8rem',
          border: '1px solid #1f2940',
          borderRadius: 6,
          background: 'transparent',
          color: '#cbd5e1',
          cursor: 'pointer',
          fontFamily: '"JetBrains Mono", ui-monospace, monospace',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          fontWeight: 600,
        }}
      >
        Refresh forecast
      </button>
    </section>
  );
}
