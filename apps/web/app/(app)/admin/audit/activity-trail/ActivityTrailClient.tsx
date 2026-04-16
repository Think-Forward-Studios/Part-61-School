'use client';

/**
 * ActivityTrailClient — filter bar + keyset-paginated results table for
 * /admin/audit/activity-trail (REP-02).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';

interface Row {
  reservation_id: string;
  activity_type: string;
  student_id: string | null;
  instructor_id: string | null;
  requested_by: string | null;
  requested_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  ramp_out_at: string | null;
  ramp_in_at: string | null;
  closed_at: string | null;
  grade_sheet_count: number;
  status: string;
  close_out_reason: string | null;
  requester_email: string | null;
  authorizer_email: string | null;
  student_name: string | null;
  instructor_name: string | null;
}

type Cursor = { rampOutAt: string | null; id: string } | null;

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 864e5).toISOString();
}

// Phase 3 decision: reservation.status='approved' (internal enum) renders
// as "confirmed" in the UI to honor the banned-terms rule.
function statusLabel(s: string): string {
  // allow-banned-term: matching against internal enum literal, not UI copy
  if (s === 'approved') return 'confirmed';
  return s;
}

function fmt(ts: string | null): string {
  if (!ts) return '—';
  return new Date(ts).toISOString().replace('T', ' ').slice(0, 16);
}

export function ActivityTrailClient({
  initialStudent,
  initialInstructor,
  initialBase,
  initialFrom,
  initialTo,
}: {
  initialStudent?: string;
  initialInstructor?: string;
  initialBase?: string;
  initialFrom?: string;
  initialTo?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [studentId, setStudentId] = useState(initialStudent ?? '');
  const [instructorId, setInstructorId] = useState(initialInstructor ?? '');
  const [baseId, setBaseId] = useState(initialBase ?? '');
  const [fromIso, setFromIso] = useState(initialFrom ?? isoDaysAgo(30));
  const [toIso, setToIso] = useState(initialTo ?? new Date().toISOString());
  const [rows, setRows] = useState<Row[]>([]);
  const [cursor, setCursor] = useState<Cursor>(null);

  const queryInput = useMemo(
    () => ({
      studentId: studentId || undefined,
      instructorId: instructorId || undefined,
      baseId: baseId || undefined,
      from: fromIso,
      to: toIso,
      limit: 100,
    }),
    [studentId, instructorId, baseId, fromIso, toIso],
  );

  const firstPage = trpc.admin.audit.activityTrail.query.useQuery(queryInput, {
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (firstPage.data) {
      setRows(firstPage.data.items as Row[]);
      setCursor(firstPage.data.nextCursor as Cursor);
    }
  }, [firstPage.data]);

  const loadMore = trpc.admin.audit.activityTrail.query.useQuery(
    { ...queryInput, cursor: cursor ?? undefined },
    { enabled: false },
  );

  const onLoadMore = useCallback(async () => {
    if (!cursor) return;
    const next = await loadMore.refetch();
    if (next.data) {
      setRows((prev) => [...prev, ...(next.data!.items as Row[])]);
      setCursor(next.data.nextCursor as Cursor);
    }
  }, [cursor, loadMore]);

  const applyFilters = useCallback(() => {
    const p = new URLSearchParams(searchParams.toString());
    const set = (k: string, v: string) => {
      if (v) p.set(k, v);
      else p.delete(k);
    };
    set('student', studentId);
    set('instructor', instructorId);
    set('base', baseId);
    set('from', fromIso);
    set('to', toIso);
    router.push(`?${p.toString()}`);
  }, [studentId, instructorId, baseId, fromIso, toIso, router, searchParams]);

  return (
    <>
      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '0.5rem',
          margin: '1rem 0',
          padding: '0.75rem',
          background: '#f8fafc',
          border: '1px solid #e5e7eb',
          borderRadius: 6,
        }}
      >
        <Field label="Student id (UUID)">
          <input
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
            style={inputStyle}
          />
        </Field>
        <Field label="Instructor id (UUID)">
          <input
            value={instructorId}
            onChange={(e) => setInstructorId(e.target.value)}
            style={inputStyle}
          />
        </Field>
        <Field label="Base id (UUID)">
          <input value={baseId} onChange={(e) => setBaseId(e.target.value)} style={inputStyle} />
        </Field>
        <Field label="From (UTC ISO)">
          <input value={fromIso} onChange={(e) => setFromIso(e.target.value)} style={inputStyle} />
        </Field>
        <Field label="To (UTC ISO)">
          <input value={toIso} onChange={(e) => setToIso(e.target.value)} style={inputStyle} />
        </Field>
        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
          <button
            type="button"
            onClick={applyFilters}
            style={{
              padding: '0.4rem 0.85rem',
              background: '#2563eb',
              color: 'white',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            Apply filters
          </button>
        </div>
      </section>

      {firstPage.isLoading ? (
        <p style={{ color: '#6b7280' }}>Loading activity trail...</p>
      ) : rows.length === 0 ? (
        <p style={{ color: '#6b7280' }}>No reservations match the current filters.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
            <thead>
              <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                <th style={thStyle}>Reservation</th>
                <th style={thStyle}>Activity</th>
                <th style={thStyle}>Student</th>
                <th style={thStyle}>Instructor</th>
                <th style={thStyle}>Scheduler</th>
                <th style={thStyle}>Requested</th>
                <th style={thStyle}>Authorizer</th>
                <th style={thStyle}>Authorized</th>
                <th style={thStyle}>Ramp-out</th>
                <th style={thStyle}>Ramp-in</th>
                <th style={thStyle}>Close-out</th>
                <th style={thStyle}>Grade sheets</th>
                <th style={thStyle}>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.reservation_id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={tdStyle}>
                    <Link href={`/schedule/${r.reservation_id}`}>
                      {r.reservation_id.slice(0, 8)}…
                    </Link>
                  </td>
                  <td style={tdStyle}>{r.activity_type}</td>
                  <td style={tdStyle}>{r.student_name ?? '—'}</td>
                  <td style={tdStyle}>{r.instructor_name ?? '—'}</td>
                  <td style={tdStyle}>{r.requester_email ?? '—'}</td>
                  <td style={tdStyle}>{fmt(r.requested_at)}</td>
                  <td style={tdStyle}>{r.authorizer_email ?? '—'}</td>
                  <td style={tdStyle}>{fmt(r.approved_at)}</td>
                  <td style={tdStyle}>{fmt(r.ramp_out_at)}</td>
                  <td style={tdStyle}>{fmt(r.ramp_in_at)}</td>
                  <td style={tdStyle}>
                    {fmt(r.closed_at)}
                    {r.close_out_reason ? (
                      <span style={{ color: '#6b7280' }}> · {r.close_out_reason}</span>
                    ) : null}
                  </td>
                  <td style={tdStyle}>{r.grade_sheet_count}</td>
                  <td style={tdStyle}>{statusLabel(r.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {cursor ? (
        <div style={{ marginTop: '1rem' }}>
          <button
            type="button"
            onClick={onLoadMore}
            style={{
              padding: '0.4rem 0.85rem',
              background: 'white',
              border: '1px solid #d1d5db',
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            {loadMore.isFetching ? 'Loading...' : 'Load more'}
          </button>
        </div>
      ) : rows.length > 0 ? (
        <p style={{ color: '#6b7280', fontSize: '0.8rem', marginTop: '0.75rem' }}>
          End of results.
        </p>
      ) : null}
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', fontSize: '0.75rem' }}>
      <span style={{ color: '#374151', fontWeight: 500 }}>{label}</span>
      {children}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '0.35rem 0.5rem',
  border: '1px solid #d1d5db',
  borderRadius: 4,
  fontSize: '0.85rem',
};

const thStyle: React.CSSProperties = {
  padding: '0.4rem',
  borderBottom: '2px solid #e5e7eb',
  textAlign: 'left',
  whiteSpace: 'nowrap',
};

const tdStyle: React.CSSProperties = {
  padding: '0.35rem',
  whiteSpace: 'nowrap',
};
