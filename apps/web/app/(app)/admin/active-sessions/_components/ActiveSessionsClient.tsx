'use client';
import { trpc } from '@/lib/trpc/client';
import { useMessagingDrawer } from '@/components/MessagingDrawerProvider';

export function ActiveSessionsClient() {
  const sessions = trpc.admin.activeSessions.list.useQuery(undefined, {
    refetchInterval: 30_000,
  });
  const { openConversation } = useMessagingDrawer();

  if (sessions.isLoading) return <div style={{ color: '#999' }}>Loading...</div>;
  if (!sessions.data?.length) return <div style={{ color: '#999' }}>No active sessions</div>;

  function relativeTime(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    return `${hrs}h ago`;
  }

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
      <thead>
        <tr style={{ borderBottom: '2px solid #e5e7eb', textAlign: 'left' }}>
          <th style={{ padding: '0.5rem' }}>User</th>
          <th style={{ padding: '0.5rem' }}>Role</th>
          <th style={{ padding: '0.5rem' }}>Base</th>
          <th style={{ padding: '0.5rem' }}>Last Seen</th>
          <th style={{ padding: '0.5rem' }}></th>
        </tr>
      </thead>
      <tbody>
        {(sessions.data as unknown as Array<Record<string, unknown>>).map((s) => (
          <tr
            key={(s.userId as string) ?? (s.user_id as string)}
            style={{ borderBottom: '1px solid #f3f4f6' }}
          >
            <td style={{ padding: '0.5rem' }}>{(s.email ?? s.user_email) as string}</td>
            <td style={{ padding: '0.5rem' }}>{(s.activeRole ?? s.active_role) as string}</td>
            <td style={{ padding: '0.5rem', color: '#666' }}>
              {((s.activeBaseId ?? s.active_base_id) as string) ?? '—'}
            </td>
            <td style={{ padding: '0.5rem', color: '#666' }}>
              {relativeTime((s.lastSeenAt ?? s.last_seen_at) as string)}
            </td>
            <td style={{ padding: '0.5rem' }}>
              <button
                onClick={() => openConversation((s.userId ?? s.user_id) as string)}
                style={{
                  padding: '0.2rem 0.5rem',
                  fontSize: '0.75rem',
                  background: '#2563eb',
                  color: 'white',
                  border: 'none',
                  borderRadius: 4,
                  cursor: 'pointer',
                }}
              >
                DM
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
