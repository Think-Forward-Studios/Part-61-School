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
  if (overdue) return 'rgba(248, 113, 113, 0.12)';
  if (r.status === 'dispatched') {
    const range = getStr(r, 'time_range', 'timeRange');
    const bounds = parseRangeBounds(range);
    if (bounds) {
      const remaining = bounds.end.getTime() - Date.now();
      if (remaining < 10 * 60_000) return 'rgba(251, 191, 36, 0.10)';
    }
    return 'rgba(52, 211, 153, 0.10)';
  }
  if (r.status === 'closed' || r.status === 'flown') return '#121826';
  return '#0d1220';
}

function rowBorder(r: Row): string {
  const { overdue } = isRowOverdue(r);
  if (overdue) return 'rgba(248, 113, 113, 0.45)';
  if (r.status === 'dispatched') {
    const range = getStr(r, 'time_range', 'timeRange');
    const bounds = parseRangeBounds(range);
    if (bounds) {
      const remaining = bounds.end.getTime() - Date.now();
      if (remaining < 10 * 60_000) return 'rgba(251, 191, 36, 0.35)';
    }
    return 'rgba(52, 211, 153, 0.35)';
  }
  return '#1f2940';
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
        border: `1px solid ${rowBorder(r)}`,
        borderRadius: 8,
        background: rowColor(r),
        marginBottom: '0.5rem',
        fontSize: '0.85rem',
        color: '#cbd5e1',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
        <strong
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.35rem',
            color: '#f7f9fc',
            fontFamily: '"JetBrains Mono", ui-monospace, monospace',
            fontSize: '0.78rem',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
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
                background: 'rgba(56, 189, 248, 0.18)',
                color: '#38bdf8',
                border: '1px solid rgba(56, 189, 248, 0.35)',
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
        <span
          style={{
            fontFamily: '"JetBrains Mono", ui-monospace, monospace',
            fontSize: '0.7rem',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: '#7a869a',
          }}
        >
          {reservationStatusLabel(r.status)}
        </span>
      </div>
      {bounds ? (
        <div
          style={{
            color: '#7a869a',
            marginTop: '0.3rem',
            fontFamily: '"JetBrains Mono", ui-monospace, monospace',
            fontSize: '0.78rem',
          }}
        >
          {bounds.start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          {' → '}
          {bounds.end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      ) : null}
      {overdue ? (
        <div
          style={{
            color: '#f87171',
            fontWeight: 700,
            marginTop: '0.35rem',
            fontFamily: '"JetBrains Mono", ui-monospace, monospace',
            fontSize: '0.75rem',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
          }}
        >
          OVERDUE by {minutes}m
        </div>
      ) : null}
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem' }}>
        {onDispatchClick ? (
          <button
            type="button"
            onClick={onDispatchClick}
            style={{
              padding: '0.35rem 0.8rem',
              background: 'rgba(56, 189, 248, 0.12)',
              color: '#38bdf8',
              border: '1px solid rgba(56, 189, 248, 0.35)',
              borderRadius: 6,
              fontSize: '0.72rem',
              fontFamily: '"JetBrains Mono", ui-monospace, monospace',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              fontWeight: 600,
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
              padding: '0.35rem 0.8rem',
              background: 'rgba(52, 211, 153, 0.12)',
              color: '#34d399',
              border: '1px solid rgba(52, 211, 153, 0.35)',
              borderRadius: 6,
              fontSize: '0.72rem',
              fontFamily: '"JetBrains Mono", ui-monospace, monospace',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              fontWeight: 600,
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
        background: '#0d1220',
        border: '1px solid #1f2940',
        borderRadius: 12,
        padding: '0.9rem',
      }}
    >
      <h2
        style={{
          margin: '0 0 0.75rem 0',
          fontSize: '0.72rem',
          fontFamily: '"JetBrains Mono", ui-monospace, monospace',
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: '#7a869a',
          fontWeight: 500,
        }}
      >
        {title}
      </h2>
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
            <p style={{ color: '#7a869a', fontSize: '0.82rem', margin: 0 }}>No active flights.</p>
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
            <p style={{ color: '#7a869a', fontSize: '0.82rem', margin: 0 }}>
              Nothing in the next 60 minutes.
            </p>
          ) : (
            upcoming.map((r) => (
              <RowCard key={r.id} r={r} showMapLink onDispatchClick={() => setDispatchTarget(r)} />
            ))
          )}
        </Panel>
        <Panel title={`Recently closed (${closed.length})`}>
          {closed.length === 0 ? (
            <p style={{ color: '#7a869a', fontSize: '0.82rem', margin: 0 }}>
              No flights closed in the last 2h.
            </p>
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
