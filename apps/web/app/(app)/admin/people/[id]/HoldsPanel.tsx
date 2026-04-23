'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';
import * as s from './_panelStyles';

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
    <section style={s.section}>
      <h2 style={s.heading}>Holds &amp; Groundings</h2>
      {error ? <p style={s.errorText}>{error}</p> : null}

      <form
        onSubmit={onCreate}
        style={{
          display: 'flex',
          gap: '0.5rem',
          marginTop: '0.85rem',
          marginBottom: '0.5rem',
          flexWrap: 'wrap',
        }}
      >
        <select name="kind" defaultValue="hold" style={s.select}>
          <option value="hold">Hold</option>
          <option value="grounding">Grounding</option>
        </select>
        <input
          name="reason"
          placeholder="Reason"
          required
          style={{ ...s.input, flex: 1, minWidth: 200 }}
        />
        <button type="submit" style={s.primaryButton} disabled={create.isPending}>
          {create.isPending ? 'Adding…' : 'Add'}
        </button>
      </form>

      {holds.length === 0 ? (
        <p style={s.emptyText}>No holds on record.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: '0.5rem 0 0' }}>
          {holds.map((h) => (
            <li key={h.id} style={s.listRow}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div>
                  <strong style={{ color: '#f7f9fc' }}>{h.kind.toUpperCase()}</strong> ·{' '}
                  <span style={{ color: '#cbd5e1' }}>{h.reason}</span>
                </div>
                <div style={s.listRowMeta}>
                  Placed {new Date(h.createdAt).toLocaleString()}
                  {h.clearedAt
                    ? ` · Cleared ${new Date(h.clearedAt).toLocaleString()}${
                        h.clearedReason ? ` (${h.clearedReason})` : ''
                      }`
                    : ' · ACTIVE'}
                </div>
              </div>
              {!h.clearedAt ? (
                <button type="button" onClick={() => onClear(h.id)} style={s.danger}>
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
