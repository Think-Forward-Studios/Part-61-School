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

  if (unackedQuery.isLoading) return <p>Loading FIF notices…</p>;
  if (notices.length === 0) {
    return (
      <p style={{ color: '#16a34a', fontSize: '0.85rem' }}>
        ✓ All Flight Information File notices acknowledged
      </p>
    );
  }
  return (
    <div>
      <p style={{ color: '#b91c1c', fontSize: '0.85rem' }}>
        You have {notices.length} unread Flight Information File notice
        {notices.length === 1 ? '' : 's'}. Read each one and acknowledge before dispatch.
      </p>
      {notices.map((n) => (
        <div
          key={n.id}
          style={{
            padding: '0.5rem',
            border: '1px solid #fbbf24',
            background: '#fffbeb',
            borderRadius: 4,
            marginBottom: '0.5rem',
          }}
        >
          <strong>{n.title}</strong>
          <p style={{ margin: '0.25rem 0', whiteSpace: 'pre-wrap', fontSize: '0.85rem' }}>
            {n.body}
          </p>
          <button
            type="button"
            disabled={ack.isPending}
            onClick={() => ack.mutate({ noticeId: n.id })}
            style={{
              padding: '0.25rem 0.5rem',
              background: '#0070f3',
              color: 'white',
              border: 0,
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            I have read and understand
          </button>
        </div>
      ))}
    </div>
  );
}
