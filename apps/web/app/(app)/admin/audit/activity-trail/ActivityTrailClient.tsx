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

const TH: React.CSSProperties = {
  textAlign: 'left',
  padding: '0.65rem 0.9rem',
  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
  fontSize: '0.68rem',
  letterSpacing: '0.15em',
  color: '#7a869a',
  textTransform: 'uppercase',
  fontWeight: 500,
  borderBottom: '1px solid #1f2940',
  whiteSpace: 'nowrap',
};

const TD: React.CSSProperties = {
  padding: '0.65rem 0.9rem',
  color: '#cbd5e1',
  fontSize: '0.78rem',
  whiteSpace: 'nowrap',
};

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
          padding: '0.85rem',
          background: '#121826',
          border: '1px solid #1f2940',
          borderRadius: 10,
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
              padding: '0.45rem 0.9rem',
              background: 'rgba(56, 189, 248, 0.12)',
              color: '#38bdf8',
              border: '1px solid rgba(56, 189, 248, 0.35)',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: '0.72rem',
              fontFamily: '"JetBrains Mono", ui-monospace, monospace',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              fontWeight: 600,
            }}
          >
            Apply filters
          </button>
        </div>
      </section>

      {firstPage.isLoading ? (
        <div
          style={{
            padding: '3rem 1rem',
            textAlign: 'center',
            color: '#7a869a',
            fontSize: '0.88rem',
            background: '#0d1220',
            border: '1px dashed #1f2940',
            borderRadius: 12,
          }}
        >
          Loading activity trail...
        </div>
      ) : rows.length === 0 ? (
        <div
          style={{
            padding: '3rem 1rem',
            textAlign: 'center',
            color: '#7a869a',
            fontSize: '0.88rem',
            background: '#0d1220',
            border: '1px dashed #1f2940',
            borderRadius: 12,
          }}
        >
          No reservations match the current filters.
        </div>
      ) : (
        <div
          style={{
            background: '#0d1220',
            border: '1px solid #1f2940',
            borderRadius: 12,
            overflow: 'hidden',
            overflowX: 'auto',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
            <thead>
              <tr style={{ background: '#121826' }}>
                <th style={TH}>Reservation</th>
                <th style={TH}>Activity</th>
                <th style={TH}>Student</th>
                <th style={TH}>Instructor</th>
                <th style={TH}>Scheduler</th>
                <th style={TH}>Requested</th>
                <th style={TH}>Authorizer</th>
                <th style={TH}>Authorized</th>
                <th style={TH}>Ramp-out</th>
                <th style={TH}>Ramp-in</th>
                <th style={TH}>Close-out</th>
                <th style={TH}>Grade sheets</th>
                <th style={TH}>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.reservation_id} style={{ borderBottom: '1px solid #161d30' }}>
                  <td
                    style={{
                      ...TD,
                      fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                      fontSize: '0.74rem',
                    }}
                  >
                    <Link
                      href={`/schedule/${r.reservation_id}`}
                      style={{ color: '#38bdf8', textDecoration: 'none' }}
                    >
                      {r.reservation_id.slice(0, 8)}…
                    </Link>
                  </td>
                  <td style={TD}>{r.activity_type}</td>
                  <td style={TD}>
                    {r.student_name ?? <span style={{ color: '#5b6784' }}>—</span>}
                  </td>
                  <td style={TD}>
                    {r.instructor_name ?? <span style={{ color: '#5b6784' }}>—</span>}
                  </td>
                  <td style={TD}>
                    {r.requester_email ?? <span style={{ color: '#5b6784' }}>—</span>}
                  </td>
                  <td
                    style={{
                      ...TD,
                      fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                      fontSize: '0.72rem',
                    }}
                  >
                    {r.requested_at ? (
                      fmt(r.requested_at)
                    ) : (
                      <span style={{ color: '#5b6784' }}>—</span>
                    )}
                  </td>
                  <td style={TD}>
                    {r.authorizer_email ?? <span style={{ color: '#5b6784' }}>—</span>}
                  </td>
                  <td
                    style={{
                      ...TD,
                      fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                      fontSize: '0.72rem',
                    }}
                  >
                    {r.approved_at ? (
                      fmt(r.approved_at)
                    ) : (
                      <span style={{ color: '#5b6784' }}>—</span>
                    )}
                  </td>
                  <td
                    style={{
                      ...TD,
                      fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                      fontSize: '0.72rem',
                    }}
                  >
                    {r.ramp_out_at ? (
                      fmt(r.ramp_out_at)
                    ) : (
                      <span style={{ color: '#5b6784' }}>—</span>
                    )}
                  </td>
                  <td
                    style={{
                      ...TD,
                      fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                      fontSize: '0.72rem',
                    }}
                  >
                    {r.ramp_in_at ? fmt(r.ramp_in_at) : <span style={{ color: '#5b6784' }}>—</span>}
                  </td>
                  <td
                    style={{
                      ...TD,
                      fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                      fontSize: '0.72rem',
                    }}
                  >
                    {r.closed_at ? fmt(r.closed_at) : <span style={{ color: '#5b6784' }}>—</span>}
                    {r.close_out_reason ? (
                      <span style={{ color: '#7a869a' }}> · {r.close_out_reason}</span>
                    ) : null}
                  </td>
                  <td style={TD}>{r.grade_sheet_count}</td>
                  <td style={TD}>{statusLabel(r.status)}</td>
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
              padding: '0.45rem 0.9rem',
              background: 'transparent',
              color: '#cbd5e1',
              border: '1px solid #293352',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: '0.72rem',
              fontFamily: '"JetBrains Mono", ui-monospace, monospace',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              fontWeight: 600,
            }}
          >
            {loadMore.isFetching ? 'Loading...' : 'Load more'}
          </button>
        </div>
      ) : rows.length > 0 ? (
        <p style={{ color: '#7a869a', fontSize: '0.8rem', marginTop: '0.75rem' }}>
          End of results.
        </p>
      ) : null}
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label
      style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.75rem' }}
    >
      <span
        style={{
          color: '#7a869a',
          fontFamily: '"JetBrains Mono", ui-monospace, monospace',
          fontSize: '0.66rem',
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          fontWeight: 500,
        }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '0.4rem 0.6rem',
  background: '#0d1220',
  color: '#f7f9fc',
  border: '1px solid #293352',
  borderRadius: 6,
  fontSize: '0.82rem',
};
