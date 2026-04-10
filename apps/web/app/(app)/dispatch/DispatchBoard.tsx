'use client';

/**
 * DispatchBoard (FTR-01).
 *
 * Three-panel live board with TanStack Query refetchInterval=15000.
 * Polls dispatch.list and renders three columns:
 *   1. Currently flying  — status='dispatched'
 *   2. About to fly      — status='approved' AND start within 60min
 *   3. Recently closed   — closed in the last 2h
 *
 * Overdue rows render red. The OverdueAlarm component watches for
 * NEW overdue ids (sessionStorage diff) and plays a one-shot beep
 * + shows a dismissible banner.
 *
 * Note: dispatch.list returns raw SQL `select *` rows so columns are
 * snake_case. We tolerate either casing for forward compat.
 */
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { trpc } from '@/lib/trpc/client';
import { reservationStatusLabel } from '@part61/domain';
import { DispatchModal } from './DispatchModal';
import { OverdueAlarm } from './OverdueAlarm';
import { MelBadge } from './_components/MelBadge';

type Row = Record<string, unknown> & { id: string; status: string };

function getStr(r: Row, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = r[k];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return null;
}

function parseRangeBounds(range: string | null): { start: Date; end: Date } | null {
  if (!range) return null;
  const m = range.match(/^[\[(]\s*"?([^",]+)"?\s*,\s*"?([^"\)]+)"?\s*[\])]$/);
  if (!m) return null;
  const norm = (s: string) =>
    s
      .trim()
      .replace(' ', 'T')
      .replace(/([+-]\d{2})$/, '$1:00');
  const start = new Date(norm(m[1]!));
  const end = new Date(norm(m[2]!));
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
  return { start, end };
}

function isRowOverdue(r: Row): { overdue: boolean; minutes: number } {
  if (r.status !== 'dispatched') return { overdue: false, minutes: 0 };
  const range = getStr(r, 'time_range', 'timeRange');
  const bounds = parseRangeBounds(range);
  if (!bounds) return { overdue: false, minutes: 0 };
  const grace = 30 * 60_000;
  const diff = Date.now() - (bounds.end.getTime() + grace);
  return { overdue: diff > 0, minutes: Math.max(0, Math.floor(diff / 60_000)) };
}

function rowColor(r: Row): string {
  const { overdue } = isRowOverdue(r);
  if (overdue) return '#fee2e2';
  if (r.status === 'dispatched') {
    const range = getStr(r, 'time_range', 'timeRange');
    const bounds = parseRangeBounds(range);
    if (bounds) {
      const remaining = bounds.end.getTime() - Date.now();
      if (remaining < 10 * 60_000) return '#fef3c7';
    }
    return '#dcfce7';
  }
  if (r.status === 'closed' || r.status === 'flown') return '#f3f4f6';
  return 'white';
}

function RowCard({
  r,
  onDispatchClick,
  onCloseClick,
  showMapLink,
}: {
  r: Row;
  onDispatchClick?: () => void;
  onCloseClick?: () => void;
  showMapLink?: boolean;
}) {
  const range = getStr(r, 'time_range', 'timeRange');
  const bounds = parseRangeBounds(range);
  const activity = getStr(r, 'activity_type', 'activityType') ?? 'misc';
  const aircraftId = getStr(r, 'aircraft_id', 'aircraftId');
  const { overdue, minutes } = isRowOverdue(r);

  return (
    <div
      style={{
        padding: '0.75rem',
        border: '1px solid #e5e7eb',
        borderRadius: 6,
        background: rowColor(r),
        marginBottom: '0.5rem',
        fontSize: '0.85rem',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
        <strong style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          {activity}
          <MelBadge aircraftId={aircraftId} />
          {showMapLink && (
            <Link
              href="/fleet-map"
              title="Track on Fleet Map"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 22,
                height: 22,
                borderRadius: 4,
                background: '#3b82f6',
                color: '#fff',
                fontSize: 12,
                textDecoration: 'none',
                lineHeight: 1,
                flexShrink: 0,
              }}
            >
              {'\u2708'}
            </Link>
          )}
        </strong>
        <span>{reservationStatusLabel(r.status)}</span>
      </div>
      {bounds ? (
        <div style={{ color: '#555', marginTop: '0.25rem' }}>
          {bounds.start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          {' → '}
          {bounds.end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      ) : null}
      {overdue ? (
        <div style={{ color: '#b91c1c', fontWeight: 600, marginTop: '0.25rem' }}>
          OVERDUE by {minutes}m
        </div>
      ) : null}
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
        {onDispatchClick ? (
          <button
            type="button"
            onClick={onDispatchClick}
            style={{
              padding: '0.25rem 0.75rem',
              background: '#0070f3',
              color: 'white',
              border: 0,
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            Dispatch
          </button>
        ) : null}
        {onCloseClick ? (
          <button
            type="button"
            onClick={onCloseClick}
            style={{
              padding: '0.25rem 0.75rem',
              background: '#16a34a',
              color: 'white',
              border: 0,
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            Close out
          </button>
        ) : null}
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      style={{
        flex: 1,
        minWidth: 280,
        background: '#fafafa',
        border: '1px solid #e5e7eb',
        borderRadius: 8,
        padding: '0.75rem',
      }}
    >
      <h2 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem' }}>{title}</h2>
      {children}
    </section>
  );
}

export function DispatchBoard() {
  const router = useRouter();
  const [dispatchTarget, setDispatchTarget] = useState<Row | null>(null);
  const listQuery = trpc.dispatch.list.useQuery(undefined, {
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
  });

  const data = listQuery.data as
    | {
        currentlyFlying: Row[];
        aboutToFly: Row[];
        recentlyClosed: Row[];
      }
    | undefined;

  const flying = data?.currentlyFlying ?? [];
  const upcoming = data?.aboutToFly ?? [];
  const closed = data?.recentlyClosed ?? [];

  const overdueIds = useMemo(
    () => flying.filter((r) => isRowOverdue(r).overdue).map((r) => r.id),
    [flying],
  );

  return (
    <>
      <OverdueAlarm overdueIds={overdueIds} />
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        <Panel title={`Currently flying (${flying.length})`}>
          {flying.length === 0 ? (
            <p style={{ color: '#888' }}>No active flights.</p>
          ) : (
            flying.map((r) => (
              <RowCard
                key={r.id}
                r={r}
                showMapLink
                onCloseClick={() => router.push(`/dispatch/close/${r.id}`)}
              />
            ))
          )}
        </Panel>
        <Panel title={`About to fly (${upcoming.length})`}>
          {upcoming.length === 0 ? (
            <p style={{ color: '#888' }}>Nothing in the next 60 minutes.</p>
          ) : (
            upcoming.map((r) => (
              <RowCard key={r.id} r={r} showMapLink onDispatchClick={() => setDispatchTarget(r)} />
            ))
          )}
        </Panel>
        <Panel title={`Recently closed (${closed.length})`}>
          {closed.length === 0 ? (
            <p style={{ color: '#888' }}>No flights closed in the last 2h.</p>
          ) : (
            closed.map((r) => <RowCard key={r.id} r={r} />)
          )}
        </Panel>
      </div>
      {dispatchTarget ? (
        <DispatchModal
          reservation={dispatchTarget}
          onClose={() => setDispatchTarget(null)}
          onDispatched={() => {
            setDispatchTarget(null);
            void listQuery.refetch();
          }}
        />
      ) : null}
    </>
  );
}
