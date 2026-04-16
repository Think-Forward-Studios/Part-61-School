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

  const cardStyle = {
    padding: '0.75rem',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    background: 'white',
    flex: '1 1 0',
    minWidth: 180,
  };

  const labelStyle = {
    fontSize: '0.7rem',
    color: '#666',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  };
  const bigStyle = { fontSize: '1.4rem', fontWeight: 700, margin: '0.25rem 0' };
  const subStyle = { fontSize: '0.8rem', color: '#999' };

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
          borderColor:
            duty.data && duty.data.minutes >= 420
              ? '#fecaca'
              : duty.data && duty.data.minutes >= 360
                ? '#fde68a'
                : '#e5e7eb',
        }}
      >
        <div style={labelStyle}>24h Duty Window</div>
        <div style={bigStyle}>{duty.data ? `${duty.data.minutes}min` : '\u2014'}</div>
        <div style={subStyle}>
          {duty.data ? `of ${duty.data.maxMinutes}min allowed` : 'Loading...'}
        </div>
        {duty.data && duty.data.minutes >= 420 && (
          <div style={{ fontSize: '0.75rem', color: '#dc2626', marginTop: '0.25rem' }}>
            \u26A0 Approaching duty limit
          </div>
        )}
      </div>
    </div>
  );
}
