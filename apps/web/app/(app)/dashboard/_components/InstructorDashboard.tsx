'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc/client';
import { DashboardTile } from '@/components/DashboardTile';
import { GradingActionDrawer } from './GradingActionDrawer';
import { ReservationApproveInline } from './ReservationApproveInline';

export function InstructorDashboard() {
  const [gradingSheetId, setGradingSheetId] = useState<string | null>(null);
  const me = trpc.me.get.useQuery();
  const userId = (me.data as Record<string, unknown> | undefined)?.userId as string | undefined;

  const students = trpc.me.getAssignedStudents.useQuery();
  const requested = trpc.schedule.listRequestedForMe.useQuery();

  const gridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
    gap: '0.75rem',
  };

  return (
    <>
      <div style={gridStyle}>
        {/* Tile 1: Today's schedule */}
        <DashboardTile title="Today&rsquo;s Schedule" href="/schedule">
          <span style={{ color: '#999' }}>View your schedule &rarr;</span>
        </DashboardTile>

        {/* Tile 2: Assigned students */}
        <DashboardTile title="Assigned Students">
          {students.isLoading ? (
            <span style={{ color: '#999' }}>Loading...</span>
          ) : (students.data as unknown as unknown[] | undefined)?.length ? (
            (students.data as unknown as Array<Record<string, unknown>>).slice(0, 8).map((s) => (
              <div key={s.student_id as string} style={{ marginBottom: '0.25rem' }}>
                <a
                  href={`/admin/people/${s.student_id as string}`}
                  style={{ color: '#2563eb', textDecoration: 'none' }}
                >
                  {s.student_name as string}
                </a>
                {s.course_name ? (
                  <span style={{ color: '#999', marginLeft: '0.5rem', fontSize: '0.8rem' }}>
                    {s.course_name as string}
                  </span>
                ) : null}
              </div>
            ))
          ) : (
            <span style={{ color: '#999' }}>No students assigned</span>
          )}
        </DashboardTile>

        {/* Tile 3: Pending grades */}
        <DashboardTile title="Pending Grades" accent="warn">
          <span style={{ color: '#999' }}>Grade sheets pending on your schedule page</span>
        </DashboardTile>

        {/* Tile 4: Pending stage checks */}
        <DashboardTile title="Stage Checks" href="/admin/stage-checks">
          <span style={{ color: '#999' }}>View stage checks &rarr;</span>
        </DashboardTile>

        {/* Tile 5: Reservation confirmation requests */}
        <DashboardTile
          title="Confirmation Requests"
          accent={(requested.data as unknown as unknown[] | undefined)?.length ? 'warn' : 'default'}
        >
          {requested.isLoading ? (
            <span style={{ color: '#999' }}>Loading...</span>
          ) : (requested.data as unknown as unknown[] | undefined)?.length ? (
            (requested.data as unknown as Array<Record<string, unknown>>).map((r) => (
              <div
                key={r.id as string}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '0.5rem',
                  padding: '0.25rem 0',
                  borderBottom: '1px solid #f3f4f6',
                }}
              >
                <div>
                  <strong>{(r.student_name as string) ?? 'Student'}</strong>
                  {' \u00B7 '}
                  <span style={{ color: '#666' }}>{(r.aircraft_tail as string) ?? ''}</span>
                </div>
                <ReservationApproveInline reservationId={r.id as string} />
              </div>
            ))
          ) : (
            <span style={{ color: '#999' }}>No pending requests</span>
          )}
        </DashboardTile>

        {/* Tile 6: Workload ticker */}
        <DashboardTile title="Workload" accent="info">
          {userId ? (
            <WorkloadTicker instructorId={userId} />
          ) : (
            <span style={{ color: '#999' }}>Loading...</span>
          )}
        </DashboardTile>
      </div>

      {gradingSheetId && (
        <GradingActionDrawer
          gradeSheetId={gradingSheetId}
          onClose={() => setGradingSheetId(null)}
        />
      )}
    </>
  );
}

function WorkloadTicker({ instructorId }: { instructorId: string }) {
  const workload = trpc.instructorMetrics.workloadForInstructor.useQuery({ instructorId });
  if (workload.isLoading) return <span style={{ color: '#999' }}>Loading...</span>;
  if (!workload.data) return <span style={{ color: '#999' }}>No data</span>;
  const d = workload.data as Record<string, number>;
  return (
    <div>
      <div>{(d.hoursThisWeek ?? 0).toFixed(1)}h this week</div>
      <div style={{ color: '#666', fontSize: '0.85rem' }}>
        {d.studentsAssigned ?? 0} students &middot; {d.pendingGrades ?? 0} pending grades
      </div>
    </div>
  );
}
