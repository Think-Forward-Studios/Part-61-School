'use client';

/**
 * BroadcastBanner — Phase 8 (08-02, MSG-02).
 *
 * Pinned top banner on authenticated pages. Fetches active (not-yet-
 * acknowledged, non-expired) broadcasts via trpc.broadcasts.listActive
 * and invalidates the query when a realtime `broadcast` INSERT arrives.
 *
 * Urgency styling:
 *   - 'urgent' → red border, white background, red accent
 *   - 'normal' → amber border
 *
 * Dismissing calls trpc.broadcasts.acknowledge which inserts a
 * broadcast_read row and removes the banner on success.
 */
import { trpc } from '@/lib/trpc/client';
import { useRealtimeEvents } from './RealtimeUserChannelProvider';

interface BroadcastRow {
  id: string;
  title: string;
  body: string;
  urgency: 'normal' | 'urgent' | string;
  sent_at?: string | Date;
  sentAt?: string | Date;
}

export function BroadcastBanner() {
  const utils = trpc.useUtils();
  const listQ = trpc.broadcasts.listActive.useQuery();
  const ack = trpc.broadcasts.acknowledge.useMutation({
    onSuccess: () => {
      void utils.broadcasts.listActive.invalidate();
    },
  });

  useRealtimeEvents('broadcast', () => {
    void utils.broadcasts.listActive.invalidate();
  });

  const rows = (listQ.data ?? []) as unknown as BroadcastRow[];
  if (rows.length === 0) return null;

  return (
    <div style={{ position: 'sticky', top: 0, zIndex: 40 }}>
      {rows.map((b) => {
        const urgent = b.urgency === 'urgent';
        return (
          <div
            key={b.id}
            role="alert"
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: '0.75rem',
              padding: '0.5rem 1rem',
              background: urgent ? '#fee2e2' : '#fef3c7',
              borderBottom: urgent ? '2px solid #b91c1c' : '1px solid #f59e0b',
              color: urgent ? '#7f1d1d' : '#78350f',
            }}
          >
            <div style={{ fontSize: '0.85rem' }}>
              <strong>{b.title}</strong>
              {b.body ? <span style={{ marginLeft: '0.5rem' }}>{b.body}</span> : null}
            </div>
            <button
              type="button"
              onClick={() => ack.mutate({ broadcastId: b.id })}
              disabled={ack.isPending}
              style={{
                background: 'transparent',
                border: 0,
                cursor: 'pointer',
                color: 'inherit',
                fontWeight: 700,
              }}
            >
              Dismiss
            </button>
          </div>
        );
      })}
    </div>
  );
}
