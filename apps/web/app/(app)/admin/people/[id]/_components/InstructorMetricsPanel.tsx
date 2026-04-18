'use client';
import { trpc } from '@/lib/trpc/client';

interface Props {
  personId: string;
}

export function InstructorMetricsPanel({ personId }: Props) {
  const passRate = trpc.instructorMetrics.passRate.useQuery({ instructorId: personId });
  const workload = trpc.instructorMetrics.workloadForInstructor.useQuery({
    instructorId: personId,
  });
  const duty = trpc.instructorMetrics.dutyHoursInWindow.useQuery({ instructorId: personId });

  const cardStyle: React.CSSProperties = {
    padding: '1rem 1.1rem',
    border: '1px solid #1f2940',
    borderRadius: 12,
    background: '#0d1220',
    flex: '1 1 0',
    minWidth: 180,
  };

  const labelStyle: React.CSSProperties = {
    fontSize: '0.68rem',
    color: '#7a869a',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.15em',
    fontFamily: '"JetBrains Mono", ui-monospace, monospace',
    fontWeight: 500,
  };
  const bigStyle: React.CSSProperties = {
    fontSize: '1.6rem',
    fontWeight: 600,
    margin: '0.35rem 0',
    color: '#f7f9fc',
    fontFamily: '"Antonio", system-ui, sans-serif',
    letterSpacing: '-0.01em',
  };
  const subStyle: React.CSSProperties = { fontSize: '0.78rem', color: '#7a869a' };

  const dutyBorder =
    duty.data && duty.data.minutes >= 420
      ? 'rgba(248, 113, 113, 0.35)'
      : duty.data && duty.data.minutes >= 360
        ? 'rgba(251, 191, 36, 0.35)'
        : '#1f2940';

  return (
    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '1rem' }}>
      {/* Pass rate */}
      <div style={cardStyle}>
        <div style={labelStyle}>FAA Checkride Pass Rate</div>
        <div style={bigStyle}>
          {passRate.data?.passRateFirstAttempt !== null &&
          passRate.data?.passRateFirstAttempt !== undefined
            ? `${(passRate.data.passRateFirstAttempt * 100).toFixed(0)}%`
            : '\u2014'}
        </div>
        <div style={subStyle}>
          {passRate.data
            ? `${passRate.data.passesFirstAttempt} of ${passRate.data.attemptsTotal} first-attempt`
            : 'Loading...'}
        </div>
      </div>

      {/* Workload */}
      <div style={cardStyle}>
        <div style={labelStyle}>Workload This Week</div>
        <div style={bigStyle}>
          {workload.data ? `${workload.data.hoursThisWeek.toFixed(1)}h` : '\u2014'}
        </div>
        <div style={subStyle}>
          {workload.data
            ? `${workload.data.studentsAssigned} students \u00B7 ${workload.data.pendingGrades} pending grades`
            : 'Loading...'}
        </div>
      </div>

      {/* Duty window */}
      <div
        style={{
          ...cardStyle,
          borderColor: dutyBorder,
        }}
      >
        <div style={labelStyle}>24h Duty Window</div>
        <div style={bigStyle}>{duty.data ? `${duty.data.minutes}min` : '\u2014'}</div>
        <div style={subStyle}>
          {duty.data ? `of ${duty.data.maxMinutes}min allowed` : 'Loading...'}
        </div>
        {duty.data && duty.data.minutes >= 420 && (
          <div
            style={{
              fontSize: '0.72rem',
              color: '#f87171',
              marginTop: '0.35rem',
              fontFamily: '"JetBrains Mono", ui-monospace, monospace',
              letterSpacing: '0.05em',
            }}
          >
            \u26A0 Approaching duty limit
          </div>
        )}
      </div>
    </div>
  );
}
