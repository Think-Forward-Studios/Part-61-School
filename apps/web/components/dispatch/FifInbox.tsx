'use client';

/**
 * FifInbox (FTR-07) — user-facing unread FIF notice surface.
 *
 * Renders a compact unread-count badge with an expandable list of
 * active notices the caller has not yet acknowledged. Each notice
 * has an "Acknowledge" button calling trpc.fif.acknowledge.
 *
 * Intended for role dashboards (student / instructor / admin).
 * Banned-term note: buttons are "Acknowledge" — never the banned word.
 */
import { useMemo, useState } from 'react';
import { trpc } from '@/lib/trpc/client';

type Notice = {
  id: string;
  title: string;
  body: string;
  severity: string;
  posted_at: string | null;
};

function toNotices(rows: unknown): Notice[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((r): r is Record<string, unknown> => typeof r === 'object' && r !== null)
    .map((r) => ({
      id: String(r.id),
      title: String(r.title ?? ''),
      body: String(r.body ?? ''),
      severity: String(r.severity ?? 'info'),
      posted_at: r.posted_at ? String(r.posted_at) : null,
    }));
}

function severityColor(sev: string): string {
  if (sev === 'critical') return '#b91c1c';
  if (sev === 'important') return '#b45309';
  return '#0369a1';
}

export function FifInbox() {
  const unackedQuery = trpc.fif.listUnacked.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const ack = trpc.fif.acknowledge.useMutation({
    onSuccess: () => unackedQuery.refetch(),
  });
  const notices = useMemo(() => toNotices(unackedQuery.data), [unackedQuery.data]);
  const [expanded, setExpanded] = useState(true);

  if (unackedQuery.isLoading) {
    return (
      <section
        style={{
          padding: '0.75rem',
          border: '1px solid #e5e7eb',
          borderRadius: 8,
          background: 'white',
        }}
      >
        <strong>Flight Information File</strong>
        <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: '#6b7280' }}>Loading…</p>
      </section>
    );
  }

  if (notices.length === 0) {
    return (
      <section
        style={{
          padding: '0.75rem',
          border: '1px solid #bbf7d0',
          borderRadius: 8,
          background: '#f0fdf4',
        }}
      >
        <strong>Flight Information File</strong>
        <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: '#166534' }}>
          No unread notices. You are current.
        </p>
      </section>
    );
  }

  return (
    <section
      style={{
        padding: '0.75rem',
        border: '1px solid #fbbf24',
        borderRadius: 8,
        background: '#fffbeb',
      }}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          background: 'transparent',
          border: 0,
          padding: 0,
          cursor: 'pointer',
          width: '100%',
          textAlign: 'left',
        }}
      >
        <strong>Flight Information File</strong>
        <span
          style={{
            padding: '0.1rem 0.5rem',
            background: '#b91c1c',
            color: 'white',
            borderRadius: 999,
            fontSize: '0.75rem',
          }}
        >
          {notices.length} unread
        </span>
        <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: '#6b7280' }}>
          {expanded ? '▾' : '▸'}
        </span>
      </button>
      {expanded ? (
        <ul style={{ listStyle: 'none', padding: 0, margin: '0.5rem 0 0' }}>
          {notices.map((n) => (
            <li
              key={n.id}
              style={{
                padding: '0.5rem',
                marginTop: '0.5rem',
                background: 'white',
                borderRadius: 4,
                border: '1px solid #fde68a',
              }}
            >
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'baseline' }}>
                <span
                  style={{
                    fontSize: '0.7rem',
                    color: 'white',
                    background: severityColor(n.severity),
                    padding: '0.1rem 0.4rem',
                    borderRadius: 3,
                    textTransform: 'uppercase',
                  }}
                >
                  {n.severity}
                </span>
                <strong style={{ fontSize: '0.9rem' }}>{n.title}</strong>
              </div>
              <p
                style={{
                  margin: '0.35rem 0',
                  whiteSpace: 'pre-wrap',
                  fontSize: '0.85rem',
                  color: '#374151',
                }}
              >
                {n.body}
              </p>
              <button
                type="button"
                disabled={ack.isPending}
                onClick={() => ack.mutate({ noticeId: n.id })}
                style={{
                  padding: '0.25rem 0.75rem',
                  background: '#0070f3',
                  color: 'white',
                  border: 0,
                  borderRadius: 4,
                  cursor: ack.isPending ? 'not-allowed' : 'pointer',
                  fontSize: '0.8rem',
                }}
              >
                Acknowledge
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
