'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';
import * as s from './_panelStyles';

interface EngineRow {
  id: string;
  position: string;
  serialNumber: string | null;
  removedAt: string | null;
}

const POSITIONS = ['single', 'left', 'right', 'center', 'n1', 'n2', 'n3', 'n4'] as const;

export function EnginesPanel({
  aircraftId,
  engines,
}: {
  aircraftId: string;
  engines: EngineRow[];
}) {
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
    <section style={s.section}>
      <h2 style={s.heading}>Engines</h2>
      {error ? <p style={s.errorText}>{error}</p> : null}

      {engines.length === 0 ? (
        <p style={s.emptyText}>No engines on record.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: '0.5rem 0 0' }}>
          {engines.map((e) => (
            <li key={e.id} style={s.listRow}>
              <div>
                <strong
                  style={{ color: '#f7f9fc', textTransform: 'uppercase', letterSpacing: '0.04em' }}
                >
                  {e.position}
                </strong>
                {e.serialNumber ? (
                  <span style={{ color: '#94a3b8', marginLeft: '0.5rem', fontSize: '0.82rem' }}>
                    S/N {e.serialNumber}
                  </span>
                ) : null}
                {e.removedAt ? (
                  <span
                    style={{
                      marginLeft: '0.5rem',
                      color: '#fca5a5',
                      fontSize: '0.7rem',
                      fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                      letterSpacing: '0.1em',
                    }}
                  >
                    REMOVED
                  </span>
                ) : null}
              </div>
              {!e.removedAt ? (
                <button type="button" onClick={() => onRemove(e.id)} style={s.danger}>
                  Remove
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <form
        onSubmit={onAdd}
        style={{ display: 'flex', gap: '0.5rem', marginTop: '0.85rem', flexWrap: 'wrap' }}
      >
        <select name="position" defaultValue="single" style={s.select}>
          {POSITIONS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <input
          name="serialNumber"
          placeholder="Serial number"
          style={{ ...s.input, flex: 1, minWidth: 180 }}
        />
        <button type="submit" style={s.primaryButton} disabled={add.isPending}>
          {add.isPending ? 'Adding…' : 'Add engine'}
        </button>
      </form>
    </section>
  );
}
