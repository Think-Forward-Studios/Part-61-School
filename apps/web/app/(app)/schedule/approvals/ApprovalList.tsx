'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';
import { ActivityChip } from '@/components/schedule/ActivityChip';
import { StatusLabel } from '@/components/schedule/StatusLabel';

type Row = {
  id: string;
  activityType: string;
  status: string;
  startsAt: string | null;
  endsAt: string | null;
  aircraftTail: string | null;
  aircraftId: string | null;
  instructorName: string | null;
  instructorId: string | null;
  studentName: string | null;
  studentId: string | null;
  roomName: string | null;
  notes: string | null;
};

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

const MONO_TD: React.CSSProperties = {
  ...TD,
  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
  fontSize: '0.76rem',
};

/**
 * Format a Postgres tstzrange's lower/upper pair as a compact
 * "Apr 21  14:00 → 16:00" string when start and end are on the same
 * day, or "Apr 21 14:00 → Apr 22 02:00" when they span midnight.
 */
function formatRange(startIso: string | null, endIso: string | null): string {
  if (!startIso || !endIso) return '—';
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return '—';
  const dayOpts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  const timeOpts: Intl.DateTimeFormatOptions = {
    hour: 'numeric',
    minute: '2-digit',
    hour12: false,
  };
  const sameDay =
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth() &&
    start.getDate() === end.getDate();
  const startDay = start.toLocaleDateString(undefined, dayOpts);
  const startTime = start.toLocaleTimeString(undefined, timeOpts);
  const endTime = end.toLocaleTimeString(undefined, timeOpts);
  if (sameDay) {
    return `${startDay} · ${startTime} → ${endTime}`;
  }
  const endDay = end.toLocaleDateString(undefined, dayOpts);
  return `${startDay} ${startTime} → ${endDay} ${endTime}`;
}

function Missing({ label = '—' }: { label?: string }) {
  return <span style={{ color: '#5b6784' }}>{label}</span>;
}

export function ApprovalList({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const confirmMut = trpc.schedule.approve.useMutation();
  const cancelMut = trpc.schedule.cancel.useMutation();

  async function onConfirm(id: string) {
    setBusyId(id);
    setErrors((e) => ({ ...e, [id]: '' }));
    try {
      await confirmMut.mutateAsync({ reservationId: id });
      router.refresh();
    } catch (e) {
      setErrors((prev) => ({
        ...prev,
        [id]: e instanceof Error ? e.message : 'Failed',
      }));
    } finally {
      setBusyId(null);
    }
  }

  async function onReject(id: string) {
    if (!confirm('Reject this reservation request?')) return;
    setBusyId(id);
    try {
      await cancelMut.mutateAsync({ reservationId: id });
      router.refresh();
    } catch (e) {
      setErrors((prev) => ({
        ...prev,
        [id]: e instanceof Error ? e.message : 'Failed',
      }));
    } finally {
      setBusyId(null);
    }
  }

  if (rows.length === 0) {
    return (
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
        No pending requests.
      </div>
    );
  }

  return (
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
            <th style={TH}>Activity</th>
            <th style={TH}>Status</th>
            <th style={TH}>When</th>
            <th style={TH}>Aircraft</th>
            <th style={TH}>Instructor</th>
            <th style={TH}>Student</th>
            <th style={TH}>Room</th>
            <th style={{ ...TH, textAlign: 'right' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} style={{ borderBottom: '1px solid #161d30' }}>
              <td style={TD}>
                <ActivityChip type={r.activityType} />
              </td>
              <td style={TD}>
                <StatusLabel status={r.status} />
              </td>
              <td style={MONO_TD}>{formatRange(r.startsAt, r.endsAt)}</td>
              <td style={TD}>
                {r.aircraftTail ? (
                  <span
                    style={{
                      fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                      fontSize: '0.78rem',
                      color: '#f7f9fc',
                    }}
                  >
                    {r.aircraftTail}
                  </span>
                ) : (
                  <Missing />
                )}
              </td>
              <td style={TD}>{r.instructorName ?? <Missing />}</td>
              <td style={TD}>{r.studentName ?? <Missing />}</td>
              <td style={TD}>{r.roomName ?? <Missing />}</td>
              <td style={{ padding: '0.7rem 0.9rem', textAlign: 'right' }}>
                <div style={{ display: 'inline-flex', gap: '0.4rem' }}>
                  <button
                    type="button"
                    disabled={busyId === r.id}
                    onClick={() => onConfirm(r.id)}
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
                      cursor: busyId === r.id ? 'not-allowed' : 'pointer',
                      opacity: busyId === r.id ? 0.5 : 1,
                    }}
                  >
                    Confirm
                  </button>
                  <button
                    type="button"
                    disabled={busyId === r.id}
                    onClick={() => onReject(r.id)}
                    style={{
                      padding: '0.35rem 0.8rem',
                      background: 'transparent',
                      color: '#f87171',
                      border: '1px solid rgba(248, 113, 113, 0.35)',
                      borderRadius: 6,
                      fontSize: '0.72rem',
                      fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                      letterSpacing: '0.1em',
                      textTransform: 'uppercase',
                      fontWeight: 600,
                      cursor: busyId === r.id ? 'not-allowed' : 'pointer',
                      opacity: busyId === r.id ? 0.5 : 1,
                    }}
                  >
                    Reject
                  </button>
                </div>
                {errors[r.id] ? (
                  <div
                    style={{
                      color: '#f87171',
                      fontSize: '0.72rem',
                      marginTop: '0.35rem',
                      textAlign: 'right',
                    }}
                  >
                    {errors[r.id]}
                  </div>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
