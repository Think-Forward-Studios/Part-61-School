'use client';

/**
 * MelBadge — yellow "MEL: N deferred" pill for the dispatch screen.
 *
 * Reads admin.squawks.list once and filters client-side for squawks on
 * the given aircraft with status='deferred'. Does NOT block dispatch —
 * purely a reminder per CONTEXT (yellow badge, not a gate).
 */
import { trpc } from '@/lib/trpc/client';

interface SquawkRow {
  aircraftId: string;
  status: string;
  title: string;
}

export function MelBadge({ aircraftId }: { aircraftId: string | null }) {
  const q = trpc.admin.squawks.list.useQuery(undefined, {
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  if (!aircraftId) return null;
  const rows = (q.data as unknown as SquawkRow[] | undefined) ?? [];
  const deferred = rows.filter((r) => r.aircraftId === aircraftId && r.status === 'deferred');
  if (deferred.length === 0) return null;

  const titles = deferred.map((d) => d.title).join(', ');
  return (
    <span
      title={`Deferred items: ${titles}`}
      style={{
        display: 'inline-block',
        marginLeft: '0.4rem',
        padding: '0.15rem 0.5rem',
        borderRadius: 999,
        background: 'rgba(251, 191, 36, 0.14)',
        color: '#fbbf24',
        border: '1px solid rgba(251, 191, 36, 0.4)',
        fontSize: '0.65rem',
        fontFamily: '"JetBrains Mono", ui-monospace, monospace',
        fontWeight: 700,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        verticalAlign: 'middle',
      }}
    >
      MEL: {deferred.length} deferred
    </span>
  );
}
