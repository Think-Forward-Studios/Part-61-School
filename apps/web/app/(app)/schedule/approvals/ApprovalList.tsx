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
  timeRange: string;
  aircraftId: string | null;
  instructorId: string | null;
  studentId: string | null;
  roomId: string | null;
  notes: string | null;
};

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
    return <p style={{ color: '#666' }}>No pending requests.</p>;
  }

  return (
    <table style={{ width: '100%', marginTop: '1rem', borderCollapse: 'collapse' }}>
      <thead>
        <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
          <th style={{ padding: '0.5rem' }}>Activity</th>
          <th style={{ padding: '0.5rem' }}>Status</th>
          <th style={{ padding: '0.5rem' }}>When</th>
          <th style={{ padding: '0.5rem' }}>Aircraft</th>
          <th style={{ padding: '0.5rem' }}>Instructor</th>
          <th style={{ padding: '0.5rem' }}>Student</th>
          <th style={{ padding: '0.5rem' }}>Actions</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} style={{ borderBottom: '1px solid #eee' }}>
            <td style={{ padding: '0.5rem' }}>
              <ActivityChip type={r.activityType} />
            </td>
            <td style={{ padding: '0.5rem' }}>
              <StatusLabel status={r.status} />
            </td>
            <td style={{ padding: '0.5rem', fontSize: '0.8rem' }}>{r.timeRange}</td>
            <td style={{ padding: '0.5rem', fontSize: '0.8rem' }}>
              {r.aircraftId ?? '—'}
            </td>
            <td style={{ padding: '0.5rem', fontSize: '0.8rem' }}>
              {r.instructorId ?? '—'}
            </td>
            <td style={{ padding: '0.5rem', fontSize: '0.8rem' }}>
              {r.studentId ?? '—'}
            </td>
            <td style={{ padding: '0.5rem' }}>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  disabled={busyId === r.id}
                  onClick={() => onConfirm(r.id)}
                  style={{
                    padding: '0.35rem 0.75rem',
                    background: '#16a34a',
                    color: 'white',
                    border: 'none',
                    borderRadius: 4,
                  }}
                >
                  Confirm
                </button>
                <button
                  type="button"
                  disabled={busyId === r.id}
                  onClick={() => onReject(r.id)}
                >
                  Reject
                </button>
              </div>
              {errors[r.id] ? (
                <div style={{ color: 'crimson', fontSize: '0.75rem' }}>
                  {errors[r.id]}
                </div>
              ) : null}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
