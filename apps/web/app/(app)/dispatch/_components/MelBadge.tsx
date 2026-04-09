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
  const deferred = rows.filter(
    (r) => r.aircraftId === aircraftId && r.status === 'deferred',
  );
  if (deferred.length === 0) return null;

  const titles = deferred.map((d) => d.title).join(', ');
  return (
    <span
      title={`Deferred items: ${titles}`}
      style={{
        display: 'inline-block',
        marginLeft: '0.4rem',
        padding: '0.1rem 0.5rem',
        borderRadius: 3,
        background: '#fef3c7',
        color: '#78350f',
        border: '1px solid #eab308',
        fontSize: '0.7rem',
        fontWeight: 700,
        letterSpacing: '0.03em',
        verticalAlign: 'middle',
      }}
    >
      MEL: {deferred.length} deferred
    </span>
  );
}
