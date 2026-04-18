'use client';

/**
 * AuditLogsClient — filter bar + keyset-paginated results table for
 * /admin/audit/logs (REP-01). Filter state syncs with URL params.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';

const AUDITED_TABLES = [
  'users',
  'user_roles',
  'personnel_currency',
  'instructor_currency',
  'instructor_qualification',
  'person_hold',
  'reservation',
  'flight_log_entry',
  'flight_log_time',
  'aircraft',
  'aircraft_squawk',
  'work_order',
  'maintenance_item',
  'ad_compliance',
  'aircraft_component',
  'lesson_grade_sheet',
  'line_item_grade',
  'stage_check',
  'student_endorsement',
  'student_course_enrollment',
  'course_version',
  'lesson_override',
  'school_rate',
  'geofence',
  'fif_notice',
] as const;

interface Row {
  id: string;
  user_id: string | null;
  user_email: string | null;
  actor_kind: string;
  actor_role: string | null;
  table_name: string;
  record_id: string | null;
  action: string;
  before: unknown;
  after: unknown;
  at: string;
}

type Cursor = { at: string; id: string } | null;

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
};

const TD: React.CSSProperties = {
  padding: '0.7rem 0.9rem',
  color: '#cbd5e1',
  fontSize: '0.82rem',
};

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 864e5).toISOString();
}

function diffKeys(before: unknown, after: unknown): string[] {
  const b = (before ?? {}) as Record<string, unknown>;
  const a = (after ?? {}) as Record<string, unknown>;
  const all = new Set<string>([...Object.keys(b), ...Object.keys(a)]);
  const out: string[] = [];
  for (const k of all) {
    if (JSON.stringify(b[k]) !== JSON.stringify(a[k])) out.push(k);
  }
  return out;
}

export function AuditLogsClient({
  initialUserId,
  initialTable,
  initialRecord,
  initialAction,
  initialFrom,
  initialTo,
}: {
  initialUserId?: string;
  initialTable?: string;
  initialRecord?: string;
  initialAction?: string;
  initialFrom?: string;
  initialTo?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [userId, setUserId] = useState(initialUserId ?? '');
  const [tableName, setTableName] = useState(initialTable ?? '');
  const [recordId, setRecordId] = useState(initialRecord ?? '');
  const [action, setAction] = useState(initialAction ?? '');
  const [fromIso, setFromIso] = useState(initialFrom ?? isoDaysAgo(7));
  const [toIso, setToIso] = useState(initialTo ?? new Date().toISOString());
  const [rows, setRows] = useState<Row[]>([]);
  const [cursor, setCursor] = useState<Cursor>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const queryInput = useMemo(
    () => ({
      userId: userId || undefined,
      tableName: tableName || undefined,
      recordId: recordId || undefined,
      action: (action || undefined) as 'insert' | 'update' | 'soft_delete' | undefined,
      from: fromIso,
      to: toIso,
      limit: 100,
    }),
    [userId, tableName, recordId, action, fromIso, toIso],
  );

  const firstPage = trpc.admin.audit.logs.query.useQuery(queryInput, {
    // Refetch whenever filters change.
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (firstPage.data) {
      setRows(firstPage.data.items as Row[]);
      setCursor(firstPage.data.nextCursor as Cursor);
      setExpanded(new Set());
    }
  }, [firstPage.data]);

  const loadMore = trpc.admin.audit.logs.query.useQuery(
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
    set('user', userId);
    set('table', tableName);
    set('record', recordId);
    set('action', action);
    set('from', fromIso);
    set('to', toIso);
    router.push(`?${p.toString()}`);
  }, [userId, tableName, recordId, action, fromIso, toIso, router, searchParams]);

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
        <Field label="Actor user id (UUID)">
          <input
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder="any actor"
            style={inputStyle}
          />
        </Field>
        <Field label="Table">
          <select
            value={tableName}
            onChange={(e) => setTableName(e.target.value)}
            style={inputStyle}
          >
            <option value="">Any table</option>
            {AUDITED_TABLES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Record id (UUID)">
          <input
            value={recordId}
            onChange={(e) => setRecordId(e.target.value)}
            placeholder="any record"
            style={inputStyle}
          />
        </Field>
        <Field label="Action">
          <select value={action} onChange={(e) => setAction(e.target.value)} style={inputStyle}>
            <option value="">Any</option>
            <option value="insert">insert</option>
            <option value="update">update</option>
            <option value="soft_delete">soft_delete</option>
          </select>
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
          Loading audit log...
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
          No audit rows match the current filters.
        </div>
      ) : (
        <div
          style={{
            background: '#0d1220',
            border: '1px solid #1f2940',
            borderRadius: 12,
            overflow: 'hidden',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ background: '#121826' }}>
                <th style={TH}>When (UTC)</th>
                <th style={TH}>Actor</th>
                <th style={TH}>Role</th>
                <th style={TH}>Table</th>
                <th style={TH}>Record</th>
                <th style={TH}>Action</th>
                <th style={TH}>Changed keys</th>
                <th style={TH}></th>
              </tr>
            </thead>
            <tbody>
              {rows.flatMap((r) => {
                const isOpen = expanded.has(r.id);
                const keys = diffKeys(r.before, r.after);
                const baseRow = (
                  <tr key={r.id} style={{ borderBottom: '1px solid #161d30' }}>
                    <td
                      style={{
                        ...TD,
                        fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                        fontSize: '0.76rem',
                      }}
                    >
                      {new Date(r.at).toISOString().replace('T', ' ').slice(0, 19)}
                    </td>
                    <td style={TD}>
                      {r.user_email ??
                        (r.actor_kind === 'user' ? (
                          <span style={{ color: '#5b6784' }}>—</span>
                        ) : (
                          r.actor_kind
                        ))}
                    </td>
                    <td style={TD}>
                      {r.actor_role ?? <span style={{ color: '#5b6784' }}>—</span>}
                    </td>
                    <td style={TD}>{r.table_name}</td>
                    <td
                      style={{
                        ...TD,
                        fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                        fontSize: '0.72rem',
                      }}
                    >
                      {r.record_id ?? <span style={{ color: '#5b6784' }}>—</span>}
                    </td>
                    <td style={TD}>{r.action}</td>
                    <td style={TD}>
                      {keys.join(', ') || <span style={{ color: '#5b6784' }}>—</span>}
                    </td>
                    <td style={TD}>
                      <button
                        type="button"
                        onClick={() =>
                          setExpanded((prev) => {
                            const next = new Set(prev);
                            if (next.has(r.id)) next.delete(r.id);
                            else next.add(r.id);
                            return next;
                          })
                        }
                        style={{
                          padding: '0.25rem 0.55rem',
                          background: 'transparent',
                          color: '#cbd5e1',
                          border: '1px solid #293352',
                          borderRadius: 6,
                          fontSize: '0.7rem',
                          fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                          letterSpacing: '0.08em',
                          textTransform: 'uppercase',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        {isOpen ? 'Hide' : 'Diff'}
                      </button>
                    </td>
                  </tr>
                );
                if (!isOpen) return [baseRow];
                const expandedRow = (
                  <tr key={`${r.id}-expand`} style={{ background: '#0b0f1c' }}>
                    <td colSpan={8} style={{ padding: '0.75rem 0.9rem' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <JsonBlock title="Before" value={r.before} />
                        <JsonBlock title="After" value={r.after} />
                      </div>
                    </td>
                  </tr>
                );
                return [baseRow, expandedRow];
              })}
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

function JsonBlock({ title, value }: { title: string; value: unknown }) {
  return (
    <div>
      <div
        style={{
          fontSize: '0.66rem',
          fontWeight: 600,
          color: '#7a869a',
          fontFamily: '"JetBrains Mono", ui-monospace, monospace',
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          marginBottom: '0.35rem',
        }}
      >
        {title}
      </div>
      <pre
        style={{
          fontSize: '0.72rem',
          padding: '0.65rem',
          background: '#0d1220',
          color: '#cbd5e1',
          border: '1px solid #1f2940',
          borderRadius: 6,
          margin: 0,
          overflowX: 'auto',
          maxHeight: 240,
        }}
      >
        {value ? JSON.stringify(value, null, 2) : '—'}
      </pre>
    </div>
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
