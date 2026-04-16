'use client';

/**
 * NotificationBell — Phase 8 (08-02, NOT-01).
 *
 * Header icon with unread-count badge + dropdown panel showing the
 * most recent notifications. Subscribes to the per-user realtime
 * channel; on any `notification` INSERT we invalidate both the unread
 * count and the list.
 *
 * Clicking a row calls `markRead` and, if the row carries a `linkUrl`,
 * navigates to it. "Mark all read" calls `markAllRead`.
 *
 * Note: the header button is always visible even when the caller is
 * unauthenticated (it's inside `(app)/layout.tsx` which already redirects
 * unauthenticated users). The query error state is treated as "no
 * notifications" rather than surfacing an ugly error.
 */
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';
import { useRealtimeEvents } from './RealtimeUserChannelProvider';

interface NotificationRow {
  id: string;
  title: string | null;
  body: string | null;
  linkUrl: string | null;
  readAt: string | Date | null;
  createdAt: string | Date;
}

function dismissStyle(): React.CSSProperties {
  return {
    position: 'absolute',
    right: 0,
    top: '2.25rem',
    width: 340,
    maxHeight: 420,
    overflowY: 'auto',
    background: 'white',
    border: '1px solid #d1d5db',
    borderRadius: 8,
    boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
    zIndex: 60,
    padding: '0.5rem 0',
  };
}

export function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const utils = trpc.useUtils();

  const unreadQ = trpc.notifications.unreadCount.useQuery(undefined, {
    refetchInterval: 60_000,
  });
  const listQ = trpc.notifications.list.useQuery(
    { limit: 20 },
    { enabled: open, refetchOnWindowFocus: false },
  );
  const markRead = trpc.notifications.markRead.useMutation({
    onSuccess: () => {
      void utils.notifications.unreadCount.invalidate();
      void utils.notifications.list.invalidate();
    },
  });
  const markAll = trpc.notifications.markAllRead.useMutation({
    onSuccess: () => {
      void utils.notifications.unreadCount.invalidate();
      void utils.notifications.list.invalidate();
    },
  });

  useRealtimeEvents('notification', () => {
    void utils.notifications.unreadCount.invalidate();
    if (open) void utils.notifications.list.invalidate();
  });

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!containerRef.current) return;
      if (e.target instanceof Node && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const unread = unreadQ.data ?? 0;
  const rows = (listQ.data ?? []) as NotificationRow[];

  function activate(row: NotificationRow) {
    if (!row.readAt) markRead.mutate({ id: row.id });
    if (row.linkUrl) {
      setOpen(false);
      router.push(row.linkUrl);
    }
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ''}`}
        onClick={() => setOpen((v) => !v)}
        style={{
          background: 'transparent',
          border: '1px solid #d1d5db',
          borderRadius: 6,
          padding: '0.25rem 0.5rem',
          cursor: 'pointer',
          position: 'relative',
          fontSize: '0.95rem',
        }}
      >
        {'\u{1F514}'}
        {unread > 0 ? (
          <span
            data-testid="unread-dot"
            style={{
              position: 'absolute',
              top: -4,
              right: -4,
              minWidth: 16,
              height: 16,
              padding: '0 4px',
              background: '#dc2626',
              color: 'white',
              borderRadius: 999,
              fontSize: '0.65rem',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {unread > 99 ? '99+' : unread}
          </span>
        ) : null}
      </button>
      {open ? (
        <div role="dialog" aria-label="Notifications" style={dismissStyle()}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '0.25rem 0.75rem',
              borderBottom: '1px solid #e5e7eb',
            }}
          >
            <strong style={{ fontSize: '0.85rem' }}>Notifications</strong>
            <button
              type="button"
              onClick={() => markAll.mutate()}
              disabled={markAll.isPending || unread === 0}
              style={{
                fontSize: '0.75rem',
                background: 'transparent',
                border: 0,
                color: '#2563eb',
                cursor: unread === 0 ? 'not-allowed' : 'pointer',
              }}
            >
              Mark all read
            </button>
          </div>
          {listQ.isLoading ? (
            <p style={{ padding: '0.75rem', fontSize: '0.8rem', color: '#6b7280' }}>Loading…</p>
          ) : rows.length === 0 ? (
            <p style={{ padding: '0.75rem', fontSize: '0.8rem', color: '#6b7280' }}>Nothing new.</p>
          ) : (
            <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
              {rows.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => activate(r)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      background: r.readAt ? 'transparent' : '#eff6ff',
                      border: 0,
                      borderBottom: '1px solid #f3f4f6',
                      padding: '0.5rem 0.75rem',
                      cursor: 'pointer',
                      fontSize: '0.8rem',
                    }}
                  >
                    <div style={{ fontWeight: 600 }}>{r.title ?? 'Update'}</div>
                    {r.body ? (
                      <div style={{ color: '#4b5563', marginTop: '0.1rem' }}>{r.body}</div>
                    ) : null}
                    <div style={{ color: '#9ca3af', fontSize: '0.7rem', marginTop: '0.2rem' }}>
                      {new Date(r.createdAt).toLocaleString()}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
