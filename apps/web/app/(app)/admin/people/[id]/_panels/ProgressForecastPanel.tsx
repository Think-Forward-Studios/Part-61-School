'use client';

/**
 * ProgressForecastPanel — ahead/behind indicator + projected dates (SYL-22/23).
 *
 * Fetches admin.enrollments.getProgressForecast and renders a status chip,
 * projected checkride/completion dates, and confidence level.
 */

import { trpc } from '@/lib/trpc/client';

function chipStyle(weeks: number): { bg: string; fg: string } {
  if (weeks > 0) return { bg: '#dcfce7', fg: '#166534' };
  if (weeks >= -1) return { bg: '#f5f5f5', fg: '#374151' };
  if (weeks >= -2) return { bg: '#fef3c7', fg: '#92400e' };
  return { bg: '#fee2e2', fg: '#991b1b' };
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
        <h2 style={{ fontSize: '1rem' }}>Progress forecast</h2>
        <p style={{ color: '#888' }}>Loading forecast...</p>
      </section>
    );
  }

  if (!query.data) {
    return (
      <section style={{ marginTop: '1.5rem' }}>
        <h2 style={{ fontSize: '1rem' }}>Progress forecast</h2>
        <p style={{ color: '#888' }}>No forecast data available.</p>
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
      <h2 style={{ fontSize: '1rem' }}>Progress forecast</h2>

      <div
        style={{
          display: 'inline-block',
          padding: '0.35rem 0.75rem',
          borderRadius: 6,
          background: chip.bg,
          color: chip.fg,
          fontWeight: 600,
          fontSize: '0.95rem',
        }}
      >
        {chipText(aheadBehindWeeks)}
      </div>

      <div style={{ marginTop: '0.75rem', fontSize: '0.9rem' }}>
        <div>
          Projected checkride: <strong>{fmtDate(projectedCheckride)}</strong>
        </div>
        <div>
          Projected course completion: <strong>{fmtDate(projectedCompletion)}</strong>
        </div>
      </div>

      <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#6b7280' }}>
        Confidence: {confidence} ({weeksEnrolled.toFixed(0)} weeks enrolled)
      </div>

      <button
        type="button"
        onClick={() => {
          void utils.admin.enrollments.getProgressForecast.invalidate({ enrollmentId });
        }}
        style={{
          marginTop: '0.5rem',
          fontSize: '0.8rem',
          padding: '0.25rem 0.5rem',
          border: '1px solid #d1d5db',
          borderRadius: 4,
          background: 'white',
          cursor: 'pointer',
        }}
      >
        Refresh forecast
      </button>
    </section>
  );
}
