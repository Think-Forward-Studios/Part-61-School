'use client';

/**
 * FifGate (FTR-07).
 *
 * Lists active FIF notices the caller has not yet acknowledged.
 * Each notice has an "I have read and understand" button that calls
 * fif.acknowledge. The parent waits for `allAcked` before letting
 * the dispatch flow proceed.
 */
import { useEffect, useMemo, useRef } from 'react';
import { trpc } from '@/lib/trpc/client';

type Notice = {
  id: string;
  title: string;
  body: string;
  severity: string;
};

function asNotices(rows: unknown): Notice[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((r): r is Record<string, unknown> => typeof r === 'object' && r !== null)
    .map((r) => ({
      id: String(r.id),
      title: String(r.title ?? ''),
      body: String(r.body ?? ''),
      severity: String(r.severity ?? 'info'),
    }));
}

export function FifGate({ onAllAcked }: { onAllAcked: (acked: boolean) => void }) {
  const unackedQuery = trpc.fif.listUnacked.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const ack = trpc.fif.acknowledge.useMutation({
    onSuccess: () => unackedQuery.refetch(),
  });
  const notices = useMemo(() => asNotices(unackedQuery.data), [unackedQuery.data]);

  const cbRef = useRef(onAllAcked);
  useEffect(() => {
    cbRef.current = onAllAcked;
  }, [onAllAcked]);
  useEffect(() => {
    cbRef.current(notices.length === 0);
  }, [notices.length]);

  if (unackedQuery.isLoading)
    return <p style={{ color: '#7a869a', fontSize: '0.85rem', margin: 0 }}>Loading FIF notices…</p>;
  if (notices.length === 0) {
    return (
      <p style={{ color: '#34d399', fontSize: '0.85rem', margin: 0 }}>
        ✓ All Flight Information File notices acknowledged
      </p>
    );
  }
  return (
    <div>
      <p style={{ color: '#f87171', fontSize: '0.85rem', margin: '0 0 0.5rem' }}>
        You have {notices.length} unread Flight Information File notice
        {notices.length === 1 ? '' : 's'}. Read each one and acknowledge before dispatch.
      </p>
      {notices.map((n) => (
        <div
          key={n.id}
          style={{
            padding: '0.65rem 0.8rem',
            border: '1px solid rgba(251, 191, 36, 0.4)',
            background: 'rgba(251, 191, 36, 0.08)',
            borderRadius: 8,
            marginBottom: '0.5rem',
          }}
        >
          <strong style={{ color: '#fbbf24', fontSize: '0.88rem' }}>{n.title}</strong>
          <p
            style={{
              margin: '0.35rem 0 0.5rem',
              whiteSpace: 'pre-wrap',
              fontSize: '0.82rem',
              color: '#cbd5e1',
            }}
          >
            {n.body}
          </p>
          <button
            type="button"
            disabled={ack.isPending}
            onClick={() => ack.mutate({ noticeId: n.id })}
            style={{
              padding: '0.35rem 0.8rem',
              background: 'rgba(52, 211, 153, 0.12)',
              color: '#34d399',
              border: '1px solid rgba(52, 211, 153, 0.35)',
              borderRadius: 6,
              fontSize: '0.7rem',
              fontFamily: '"JetBrains Mono", ui-monospace, monospace',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              fontWeight: 600,
              cursor: ack.isPending ? 'not-allowed' : 'pointer',
              opacity: ack.isPending ? 0.5 : 1,
            }}
          >
            I have read and understand
          </button>
        </div>
      ))}
    </div>
  );
}
