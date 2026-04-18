'use client';
import { trpc } from '@/lib/trpc/client';

interface Props {
  studentId: string;
  enrollmentId?: string;
}

export function CostSummary({ studentId, enrollmentId }: Props) {
  const cost = trpc.cost.getForStudent.useQuery({ studentId, enrollmentId });

  if (cost.isLoading)
    return (
      <div
        style={{
          color: '#5b6784',
          padding: '0.75rem',
          fontSize: '0.82rem',
        }}
      >
        Loading cost data...
      </div>
    );
  if (!cost.data) return null;

  const d = cost.data;
  const fmtCents = (c: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(c / 100);

  return (
    <div
      style={{
        display: 'flex',
        gap: '1.5rem',
        padding: '1rem 1.25rem',
        border: '1px solid #1f2940',
        borderRadius: 12,
        background: '#0d1220',
        marginBottom: '1rem',
        flexWrap: 'wrap',
      }}
    >
      <div>
        <div
          style={{
            fontFamily: '"JetBrains Mono", ui-monospace, monospace',
            fontSize: '0.68rem',
            color: '#7a869a',
            textTransform: 'uppercase',
            letterSpacing: '0.15em',
          }}
        >
          To Date
        </div>
        <div
          style={{
            fontSize: '1.6rem',
            fontWeight: 700,
            color: '#f7f9fc',
            fontFamily: '"Antonio", system-ui, sans-serif',
            letterSpacing: '-0.01em',
          }}
        >
          {fmtCents(d.liveCents)}
        </div>
        {d.breakdown && (
          <div
            style={{
              fontSize: '0.75rem',
              color: '#7a869a',
              marginTop: '0.25rem',
              fontFamily: '"JetBrains Mono", ui-monospace, monospace',
            }}
          >
            Aircraft: {fmtCents(d.breakdown.aircraftCents)} · Instructor:{' '}
            {fmtCents(d.breakdown.instructorCents)}
            {d.breakdown.groundCents > 0 && <> · Ground: {fmtCents(d.breakdown.groundCents)}</>}
            {d.breakdown.surchargeCents > 0 && (
              <> · Surcharges: {fmtCents(d.breakdown.surchargeCents)}</>
            )}
          </div>
        )}
      </div>
      <div style={{ borderLeft: '1px solid #1f2940', paddingLeft: '1.5rem' }}>
        <div
          style={{
            fontFamily: '"JetBrains Mono", ui-monospace, monospace',
            fontSize: '0.68rem',
            color: '#7a869a',
            textTransform: 'uppercase',
            letterSpacing: '0.15em',
          }}
        >
          Projected Total
        </div>
        <div
          style={{
            fontSize: '1.6rem',
            fontWeight: 700,
            color: '#f7f9fc',
            fontFamily: '"Antonio", system-ui, sans-serif',
            letterSpacing: '-0.01em',
          }}
        >
          {d.projectedCents !== null ? fmtCents(d.projectedCents) : '\u2014'}
        </div>
        {d.projectedCents === null && (
          <div style={{ fontSize: '0.75rem', color: '#5b6784' }}>
            Enroll in a course for an estimate
          </div>
        )}
      </div>
      {d.missingRates.length > 0 && (
        <div
          style={{
            fontSize: '0.75rem',
            color: '#fbbf24',
            alignSelf: 'center',
            fontFamily: '"JetBrains Mono", ui-monospace, monospace',
          }}
        >
          \u26A0 Rates not configured for: {d.missingRates.join(', ')}
        </div>
      )}
    </div>
  );
}
