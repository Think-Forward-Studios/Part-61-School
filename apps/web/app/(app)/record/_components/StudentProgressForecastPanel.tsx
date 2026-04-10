'use client';

/**
 * StudentProgressForecastPanel — ahead/behind indicator for students (SYL-22/23).
 *
 * Uses record.getMyProgressForecast (student-scoped, no input).
 *
 * Key behavioral difference from admin ProgressForecastPanel:
 * - Encouragement-first copy
 * - "Behind by 1 week" renders in neutral (not amber)
 * - Only ">2 weeks behind" goes amber — NEVER red for students
 * - No refresh button
 */

import { trpc } from '@/lib/trpc/client';

function chipStyle(weeks: number): { bg: string; fg: string } {
  if (weeks > 0) return { bg: '#dcfce7', fg: '#166534' };
  // Encouragement-first: neutral for <=2 weeks behind
  if (weeks >= -2) return { bg: '#f5f5f5', fg: '#374151' };
  // Only amber when >2 weeks behind — never red
  return { bg: '#fef3c7', fg: '#92400e' };
}

function chipText(weeks: number): string {
  if (Math.abs(weeks) < 0.1) return 'Right on track!';
  if (weeks > 0) return `Ahead by ${weeks.toFixed(1)} weeks -- great work!`;
  if (weeks >= -2) return `${Math.abs(weeks).toFixed(1)} weeks to make up -- you've got this`;
  return `Let's add a lesson this week to get back on track`;
}

function fmtDate(val: unknown): string {
  if (!val) return '--';
  const d = new Date(String(val));
  if (isNaN(d.getTime())) return '--';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function StudentProgressForecastPanel() {
  const query = trpc.record.getMyProgressForecast.useQuery();

  if (query.isLoading) {
    return (
      <section>
        <h2 style={{ fontSize: '1rem' }}>Your progress</h2>
        <p style={{ color: '#888' }}>Loading forecast...</p>
      </section>
    );
  }

  if (!query.data) {
    return (
      <section>
        <h2 style={{ fontSize: '1rem' }}>Your progress</h2>
        <p style={{ color: '#888' }}>
          No forecast data yet. Keep flying and your progress will appear here!
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
    <section>
      <h2 style={{ fontSize: '1rem' }}>Your progress</h2>

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
          Estimated checkride date: <strong>{fmtDate(projectedCheckride)}</strong>
        </div>
        <div>
          Estimated course completion: <strong>{fmtDate(projectedCompletion)}</strong>
        </div>
      </div>

      <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#6b7280' }}>
        Confidence: {confidence} ({weeksEnrolled.toFixed(0)} weeks enrolled)
      </div>
    </section>
  );
}
