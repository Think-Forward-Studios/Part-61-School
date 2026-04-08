'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';

interface HoldRow {
  id: string;
  kind: string;
  reason: string;
  createdBy: string;
  createdAt: string;
  clearedAt: string | null;
  clearedBy: string | null;
  clearedReason: string | null;
}

export function HoldsPanel({ userId, holds }: { userId: string; holds: HoldRow[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const create = trpc.people.holds.create.useMutation();
  const clear = trpc.people.holds.clear.useMutation();

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    try {
      await create.mutateAsync({
        userId,
        kind: (fd.get('kind') as 'hold' | 'grounding') ?? 'hold',
        reason: String(fd.get('reason') ?? ''),
      });
      (e.target as HTMLFormElement).reset();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
    }
  }

  async function onClear(holdId: string) {
    const reason = prompt('Reason for clearing this hold?');
    if (!reason) return;
    try {
      await clear.mutateAsync({ holdId, clearedReason: reason });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Clear failed');
    }
  }

  return (
    <section style={{ marginTop: '1rem', padding: '1rem', border: '1px solid #ddd', borderRadius: 6 }}>
      <h2>Holds &amp; Groundings</h2>
      {error ? <p style={{ color: 'crimson' }}>{error}</p> : null}
      <form onSubmit={onCreate} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <select name="kind" defaultValue="hold">
          <option value="hold">Hold</option>
          <option value="grounding">Grounding</option>
        </select>
        <input name="reason" placeholder="Reason" required style={{ flex: 1 }} />
        <button type="submit">Add</button>
      </form>
      {holds.length === 0 ? (
        <p style={{ color: '#888' }}>No holds on record.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {holds.map((h) => (
            <li key={h.id} style={{ padding: '0.5rem 0', borderBottom: '1px solid #eee' }}>
              <strong>{h.kind.toUpperCase()}</strong> — {h.reason}
              <div style={{ fontSize: '0.8rem', color: '#555' }}>
                Placed {new Date(h.createdAt).toLocaleString()}
                {h.clearedAt
                  ? ` · Cleared ${new Date(h.clearedAt).toLocaleString()} (${h.clearedReason})`
                  : ' · ACTIVE'}
              </div>
              {!h.clearedAt ? (
                <button type="button" onClick={() => onClear(h.id)}>
                  Clear
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
