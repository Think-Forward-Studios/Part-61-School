'use client';
import { trpc } from '@/lib/trpc/client';

interface Props {
  studentId: string;
  enrollmentId?: string;
}

export function CostSummary({ studentId, enrollmentId }: Props) {
  const cost = trpc.cost.getForStudent.useQuery({ studentId, enrollmentId });

  if (cost.isLoading)
    return <div style={{ color: '#999', padding: '0.5rem' }}>Loading cost data...</div>;
  if (!cost.data) return null;

  const d = cost.data;
  const fmtCents = (c: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(c / 100);

  return (
    <div
      style={{
        display: 'flex',
        gap: '1.5rem',
        padding: '1rem',
        border: '1px solid #e5e7eb',
        borderRadius: 8,
        background: '#fafafa',
        marginBottom: '1rem',
      }}
    >
      <div>
        <div
          style={{
            fontSize: '0.75rem',
            color: '#666',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          To Date
        </div>
        <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{fmtCents(d.liveCents)}</div>
        {d.breakdown && (
          <div style={{ fontSize: '0.75rem', color: '#999', marginTop: '0.25rem' }}>
            Aircraft: {fmtCents(d.breakdown.aircraftCents)} · Instructor:{' '}
            {fmtCents(d.breakdown.instructorCents)}
            {d.breakdown.groundCents > 0 && <> · Ground: {fmtCents(d.breakdown.groundCents)}</>}
            {d.breakdown.surchargeCents > 0 && (
              <> · Surcharges: {fmtCents(d.breakdown.surchargeCents)}</>
            )}
          </div>
        )}
      </div>
      <div style={{ borderLeft: '1px solid #e5e7eb', paddingLeft: '1.5rem' }}>
        <div
          style={{
            fontSize: '0.75rem',
            color: '#666',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          Projected Total
        </div>
        <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>
          {d.projectedCents !== null ? fmtCents(d.projectedCents) : '\u2014'}
        </div>
        {d.projectedCents === null && (
          <div style={{ fontSize: '0.75rem', color: '#999' }}>
            Enroll in a course for an estimate
          </div>
        )}
      </div>
      {d.missingRates.length > 0 && (
        <div style={{ fontSize: '0.75rem', color: '#f59e0b', alignSelf: 'center' }}>
          \u26A0 Rates not configured for: {d.missingRates.join(', ')}
        </div>
      )}
    </div>
  );
}
