'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';

interface EngineRow {
  id: string;
  position: string;
  serialNumber: string | null;
  removedAt: string | null;
}

const POSITIONS = ['single', 'left', 'right', 'center', 'n1', 'n2', 'n3', 'n4'] as const;

export function EnginesPanel({ aircraftId, engines }: { aircraftId: string; engines: EngineRow[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const add = trpc.admin.aircraft.addEngine.useMutation();
  const remove = trpc.admin.aircraft.removeEngine.useMutation();

  async function onAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    try {
      await add.mutateAsync({
        aircraftId,
        position: fd.get('position') as (typeof POSITIONS)[number],
        serialNumber: (fd.get('serialNumber') as string) || null,
        installedAt: null,
      });
      (e.target as HTMLFormElement).reset();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Add failed');
    }
  }

  async function onRemove(id: string) {
    if (!confirm('Mark engine as removed?')) return;
    await remove.mutateAsync({ engineId: id });
    router.refresh();
  }

  return (
    <section style={{ marginTop: '1rem', padding: '1rem', border: '1px solid #ddd', borderRadius: 6 }}>
      <h2>Engines</h2>
      {error ? <p style={{ color: 'crimson' }}>{error}</p> : null}
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {engines.map((e) => (
          <li key={e.id} style={{ padding: '0.5rem 0', borderBottom: '1px solid #eee' }}>
            <strong>{e.position}</strong>
            {e.serialNumber ? ` · S/N ${e.serialNumber}` : ''}
            {e.removedAt ? ' · REMOVED' : ''}{' '}
            {!e.removedAt ? (
              <button type="button" onClick={() => onRemove(e.id)}>
                Remove
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      <form onSubmit={onAdd} style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
        <select name="position" defaultValue="single">
          {POSITIONS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <input name="serialNumber" placeholder="Serial number" />
        <button type="submit">Add engine</button>
      </form>
    </section>
  );
}
