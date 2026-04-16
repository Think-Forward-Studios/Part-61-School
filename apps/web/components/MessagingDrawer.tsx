'use client';

/**
 * MessagingDrawer — Phase 8 (08-02, MSG-01/MSG-03).
 *
 * Right-edge slide-out mounted once at the root layout. Two panes:
 *   - Left: conversation list (trpc.messaging.conversations.list)
 *   - Right: active thread (trpc.messaging.thread.list/send/markRead)
 *
 * TRADEOFF — realtime filter: Supabase Realtime postgres_changes filter
 * cannot express `conversation_id in (...)` efficiently for a per-user
 * set that changes over time. Instead we subscribe to ALL `message`
 * INSERTs at the provider level and rely on RLS + a tRPC re-fetch to
 * drop non-participant rows. At beta scale (<= 50 users × <= 30
 * messages/day) the chatter is negligible. See RESEARCH Open Question
 * #7 + 08-02-PLAN caveat.
 *
 * `openConversation(otherUserId)` from MessagingDrawerProvider primes
 * `pendingOtherUserId`; on drawer open, the drawer calls
 * `conversations.open({ otherUserId })` to resolve the conversationId
 * and sets it active.
 */
import { useEffect, useState } from 'react';
import { trpc } from '@/lib/trpc/client';
import { useMessagingDrawer } from './MessagingDrawerProvider';
import { useRealtimeEvents } from './RealtimeUserChannelProvider';

interface ConversationRow {
  id: string;
  userALow: string;
  userBHigh: string;
  lastMessageAt?: string | Date | null;
  last_message_at?: string | Date | null;
}

interface MessageRow {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  sentAt: string | Date;
}

export function MessagingDrawer({ currentUserId }: { currentUserId: string | null }) {
  const {
    open,
    setOpen,
    activeConversationId,
    setActiveConversationId,
    pendingOtherUserId,
    clearPendingOtherUser,
  } = useMessagingDrawer();
  const utils = trpc.useUtils();
  const [draft, setDraft] = useState('');

  const convQ = trpc.messaging.conversations.list.useQuery(undefined, {
    enabled: open && !!currentUserId,
  });
  const openConv = trpc.messaging.conversations.open.useMutation({
    onSuccess: (row) => {
      if (row && typeof row === 'object' && 'id' in row) {
        setActiveConversationId((row as { id: string }).id);
      }
      void utils.messaging.conversations.list.invalidate();
    },
  });
  const threadQ = trpc.messaging.thread.list.useQuery(
    activeConversationId
      ? { conversationId: activeConversationId, limit: 50 }
      : (undefined as never),
    { enabled: open && !!activeConversationId },
  );
  const sendM = trpc.messaging.thread.send.useMutation({
    onSuccess: () => {
      setDraft('');
      if (activeConversationId) {
        void utils.messaging.thread.list.invalidate({
          conversationId: activeConversationId,
          limit: 50,
        });
      }
      void utils.messaging.conversations.list.invalidate();
    },
  });
  const markRead = trpc.messaging.thread.markRead.useMutation();

  useRealtimeEvents('message', () => {
    if (activeConversationId) {
      void utils.messaging.thread.list.invalidate({
        conversationId: activeConversationId,
        limit: 50,
      });
    }
    void utils.messaging.conversations.list.invalidate();
  });

  // Resolve a pending otherUserId → conversationId when the drawer opens.
  useEffect(() => {
    if (!open) return;
    if (!pendingOtherUserId) return;
    openConv.mutate({ otherUserId: pendingOtherUserId });
    clearPendingOtherUser();
  }, [open, pendingOtherUserId]);

  // Mark conversation read when user views it.
  useEffect(() => {
    if (!open) return;
    if (!activeConversationId) return;
    markRead.mutate({ conversationId: activeConversationId });
  }, [open, activeConversationId]);

  if (!currentUserId) return null;

  const conversations = (convQ.data ?? []) as unknown as ConversationRow[];
  const messages = (threadQ.data ?? []) as unknown as MessageRow[];

  return (
    <aside
      aria-hidden={!open}
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        height: '100vh',
        width: 480,
        maxWidth: '100vw',
        background: 'white',
        borderLeft: '1px solid #d1d5db',
        boxShadow: '-4px 0 16px rgba(0,0,0,0.12)',
        transform: open ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 180ms ease-out',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 45,
      }}
    >
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0.5rem 0.75rem',
          borderBottom: '1px solid #e5e7eb',
        }}
      >
        <strong style={{ fontSize: '0.95rem' }}>Messages</strong>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close messages"
          style={{ background: 'transparent', border: 0, cursor: 'pointer', fontSize: '1rem' }}
        >
          {'\u2715'}
        </button>
      </header>
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <nav
          style={{
            width: 180,
            borderRight: '1px solid #e5e7eb',
            overflowY: 'auto',
            flexShrink: 0,
          }}
        >
          {conversations.length === 0 ? (
            <p style={{ padding: '0.75rem', fontSize: '0.8rem', color: '#6b7280' }}>
              No conversations yet.
            </p>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {conversations.map((c) => {
                const lastAt = c.lastMessageAt ?? c.last_message_at;
                const otherId = c.userALow === currentUserId ? c.userBHigh : c.userALow;
                const active = c.id === activeConversationId;
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => setActiveConversationId(c.id)}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        padding: '0.5rem 0.75rem',
                        background: active ? '#eff6ff' : 'transparent',
                        border: 0,
                        borderBottom: '1px solid #f3f4f6',
                        cursor: 'pointer',
                        fontSize: '0.8rem',
                      }}
                    >
                      <div style={{ fontWeight: 600 }}>{otherId.slice(0, 8)}</div>
                      {lastAt ? (
                        <div style={{ color: '#6b7280', fontSize: '0.7rem' }}>
                          {new Date(lastAt).toLocaleString()}
                        </div>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </nav>
        <section style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '0.75rem',
              fontSize: '0.85rem',
              display: 'flex',
              flexDirection: 'column-reverse',
              gap: '0.5rem',
            }}
          >
            {!activeConversationId ? (
              <p style={{ color: '#6b7280' }}>Select a conversation to begin.</p>
            ) : messages.length === 0 ? (
              <p style={{ color: '#6b7280' }}>Say hello.</p>
            ) : (
              messages.map((m) => {
                const mine = m.senderId === currentUserId;
                return (
                  <div
                    key={m.id}
                    style={{
                      alignSelf: mine ? 'flex-end' : 'flex-start',
                      background: mine ? '#2563eb' : '#f3f4f6',
                      color: mine ? 'white' : '#1f2937',
                      padding: '0.4rem 0.7rem',
                      borderRadius: 12,
                      maxWidth: '80%',
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {m.body}
                  </div>
                );
              })
            )}
          </div>
          {activeConversationId ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!draft.trim() || !activeConversationId) return;
                sendM.mutate({ conversationId: activeConversationId, body: draft.trim() });
              }}
              style={{
                borderTop: '1px solid #e5e7eb',
                padding: '0.5rem',
                display: 'flex',
                gap: '0.5rem',
              }}
            >
              <input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Write a message…"
                style={{
                  flex: 1,
                  border: '1px solid #d1d5db',
                  borderRadius: 6,
                  padding: '0.4rem 0.6rem',
                  fontSize: '0.85rem',
                }}
              />
              <button
                type="submit"
                disabled={sendM.isPending || !draft.trim()}
                style={{
                  background: '#2563eb',
                  color: 'white',
                  border: 0,
                  borderRadius: 6,
                  padding: '0.4rem 0.9rem',
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                }}
              >
                Send
              </button>
            </form>
          ) : null}
        </section>
      </div>
    </aside>
  );
}

export function MessagingToggleButton() {
  const { toggle } = useMessagingDrawer();
  return (
    <button
      type="button"
      aria-label="Open messages"
      onClick={toggle}
      style={{
        background: 'transparent',
        border: '1px solid #d1d5db',
        borderRadius: 6,
        padding: '0.25rem 0.5rem',
        cursor: 'pointer',
        fontSize: '0.95rem',
      }}
    >
      {'\u{1F4AC}'}
    </button>
  );
}
