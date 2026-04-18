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

const MINT_BTN: React.CSSProperties = {
  padding: '0.45rem 0.9rem',
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
};

const ROSE_BTN: React.CSSProperties = {
  padding: '0.45rem 0.9rem',
  background: 'transparent',
  color: '#f87171',
  border: '1px solid rgba(248, 113, 113, 0.35)',
  borderRadius: 6,
  fontSize: '0.72rem',
  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  fontWeight: 600,
  cursor: 'pointer',
};

const NEUTRAL_BTN: React.CSSProperties = {
  padding: '0.45rem 0.9rem',
  background: '#0d1220',
  color: '#cbd5e1',
  border: '1px solid #1f2940',
  borderRadius: 6,
  fontSize: '0.72rem',
  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  fontWeight: 600,
  cursor: 'pointer',
};

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
        background: '#0d1220',
        borderLeft: '1px solid #1f2940',
        boxShadow: '-6px 0 24px rgba(0,0,0,0.45)',
        padding: '1.5rem',
        zIndex: 100,
        overflowY: 'auto',
        color: '#cbd5e1',
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
        <h2
          style={{
            margin: 0,
            fontFamily: '"Antonio", system-ui, sans-serif',
            fontSize: '1.35rem',
            fontWeight: 600,
            color: '#f7f9fc',
            letterSpacing: '-0.01em',
          }}
        >
          Reservation
        </h2>
        <button type="button" onClick={onClose} style={{ ...NEUTRAL_BTN, opacity: busy ? 0.6 : 1 }}>
          Close
        </button>
      </div>
      {query.isLoading ? <p style={{ color: '#7a869a' }}>Loading…</p> : null}
      {query.error ? <p style={{ color: '#f87171' }}>{query.error.message}</p> : null}
      {r ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <ActivityChip type={r.activityType} />
            <StatusLabel status={r.status} />
          </div>
          <div style={{ fontSize: '0.85rem', color: '#cbd5e1' }}>
            <span
              style={{
                fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                fontSize: '0.7rem',
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: '#7a869a',
                marginRight: '0.5rem',
              }}
            >
              When
            </span>
            <span
              style={{
                fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                fontSize: '0.8rem',
              }}
            >
              {r.timeRange}
            </span>
          </div>
          {r.notes ? (
            <div>
              <div
                style={{
                  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                  fontSize: '0.7rem',
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  color: '#7a869a',
                  marginBottom: '0.3rem',
                }}
              >
                Notes
              </div>
              <p
                style={{ margin: 0, whiteSpace: 'pre-wrap', color: '#cbd5e1', fontSize: '0.88rem' }}
              >
                {r.notes}
              </p>
            </div>
          ) : null}
          <p style={{ color: '#7a869a', fontSize: '0.8rem', margin: 0 }}>
            Status: {reservationStatusLabel(r.status)}
          </p>
          {error ? <p style={{ color: '#f87171', margin: 0 }}>{error}</p> : null}
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
            {canConfirm && r.status === 'requested' ? (
              <button
                type="button"
                disabled={busy}
                onClick={onConfirm}
                style={{
                  ...MINT_BTN,
                  cursor: busy ? 'not-allowed' : 'pointer',
                  opacity: busy ? 0.5 : 1,
                }}
              >
                {busy ? 'Working…' : 'Confirm request'}
              </button>
            ) : null}
            <button
              type="button"
              disabled={busy}
              onClick={onCancel}
              style={{
                ...ROSE_BTN,
                cursor: busy ? 'not-allowed' : 'pointer',
                opacity: busy ? 0.5 : 1,
              }}
            >
              Cancel reservation
            </button>
            <button
              type="button"
              onClick={() => router.push(`/schedule/${reservationId}`)}
              style={NEUTRAL_BTN}
            >
              Full details
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
