'use client';
import { trpc } from '@/lib/trpc/client';

export function WorkloadMonitor() {
  const workload = trpc.instructorMetrics.workloadAll.useQuery();

  if (workload.isLoading) return <div style={{ color: '#999' }}>Loading workload data...</div>;
  if (!workload.data?.length) return <div style={{ color: '#999' }}>No instructor data</div>;

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
      <thead>
        <tr style={{ borderBottom: '2px solid #e5e7eb', textAlign: 'left' }}>
          <th style={{ padding: '0.4rem' }}>Instructor</th>
          <th style={{ padding: '0.4rem' }}>Hours/Week</th>
          <th style={{ padding: '0.4rem' }}>Students</th>
          <th style={{ padding: '0.4rem' }}>Pending Grades</th>
        </tr>
      </thead>
      <tbody>
        {(workload.data as Array<Record<string, unknown>>).map((row) => {
          const hours = Number(row.hours_this_week ?? 0);
          const pending = Number(row.pending_grades ?? 0);
          const highlight = hours > 30 || pending > 3;
          return (
            <tr
              key={row.instructor_id as string}
              style={{
                borderBottom: '1px solid #f3f4f6',
                background: highlight ? '#fef2f2' : 'transparent',
              }}
            >
              <td style={{ padding: '0.4rem' }}>{row.name as string}</td>
              <td style={{ padding: '0.4rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <div
                    style={{
                      height: 6,
                      width: Math.min(hours * 3, 100),
                      background: hours > 30 ? '#dc2626' : hours > 20 ? '#f59e0b' : '#16a34a',
                      borderRadius: 3,
                    }}
                  />
                  <span>{hours.toFixed(1)}h</span>
                </div>
              </td>
              <td style={{ padding: '0.4rem' }}>{row.students_assigned as string}</td>
              <td style={{ padding: '0.4rem', color: pending > 3 ? '#dc2626' : 'inherit' }}>
                {pending}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
