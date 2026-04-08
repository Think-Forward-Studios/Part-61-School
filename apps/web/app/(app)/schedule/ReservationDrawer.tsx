'use client';

/**
 * Lightweight right-side drawer that fetches a reservation via tRPC
 * and offers Cancel + Confirm (approve) buttons. Confirm is only
 * enabled when `canConfirm` is true (instructor/admin views). The
 * button text is "Confirm request" — NOT the banned word.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { reservationStatusLabel } from '@part61/domain';
import { trpc } from '@/lib/trpc/client';
import { ActivityChip } from '@/components/schedule/ActivityChip';
import { StatusLabel } from '@/components/schedule/StatusLabel';

export function ReservationDrawer({
  reservationId,
  onClose,
  canConfirm,
}: {
  reservationId: string;
  onClose: () => void;
  canConfirm: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const query = trpc.schedule.getById.useQuery({ reservationId });
  const confirmMut = trpc.schedule.approve.useMutation();
  const cancelMut = trpc.schedule.cancel.useMutation();
  const utils = trpc.useUtils();

  const r = query.data as
    | {
        id: string;
        activityType: string;
        status: string;
        timeRange: string;
        notes: string | null;
      }
    | undefined;

  async function onConfirm() {
    setBusy(true);
    setError(null);
    try {
      await confirmMut.mutateAsync({ reservationId });
      await utils.schedule.list.invalidate();
      await query.refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  async function onCancel() {
    if (!confirm('Cancel this reservation?')) return;
    setBusy(true);
    setError(null);
    try {
      await cancelMut.mutateAsync({ reservationId });
      await utils.schedule.list.invalidate();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: 420,
        background: 'white',
        borderLeft: '1px solid #ddd',
        boxShadow: '-6px 0 24px rgba(0,0,0,0.08)',
        padding: '1.5rem',
        zIndex: 100,
        overflowY: 'auto',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1rem',
        }}
      >
        <h2 style={{ margin: 0 }}>Reservation</h2>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>
      {query.isLoading ? <p>Loading…</p> : null}
      {query.error ? (
        <p style={{ color: 'crimson' }}>{query.error.message}</p>
      ) : null}
      {r ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <ActivityChip type={r.activityType} />
            <StatusLabel status={r.status} />
          </div>
          <div style={{ fontSize: '0.85rem', color: '#444' }}>
            <strong>When:</strong> {r.timeRange}
          </div>
          {r.notes ? (
            <div>
              <strong>Notes:</strong>
              <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{r.notes}</p>
            </div>
          ) : null}
          <p style={{ color: '#666', fontSize: '0.8rem' }}>
            Status: {reservationStatusLabel(r.status)}
          </p>
          {error ? <p style={{ color: 'crimson' }}>{error}</p> : null}
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
            {canConfirm && r.status === 'requested' ? (
              <button
                type="button"
                disabled={busy}
                onClick={onConfirm}
                style={{
                  padding: '0.5rem 1rem',
                  background: '#16a34a',
                  color: 'white',
                  border: 'none',
                  borderRadius: 4,
                }}
              >
                {busy ? 'Working…' : 'Confirm request'}
              </button>
            ) : null}
            <button type="button" disabled={busy} onClick={onCancel}>
              Cancel reservation
            </button>
            <button
              type="button"
              onClick={() => router.push(`/schedule/${reservationId}`)}
            >
              Full details
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
