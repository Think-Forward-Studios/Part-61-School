'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';

interface QualRow {
  id: string;
  kind: string;
  descriptor: string;
  notes: string | null;
}

const KINDS = ['aircraft_type', 'sim_authorization', 'course_authorization'] as const;

export function QualificationsPanel({ userId, quals }: { userId: string; quals: QualRow[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const create = trpc.people.qualifications.create.useMutation();
  const revoke = trpc.people.qualifications.revoke.useMutation();

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    try {
      await create.mutateAsync({
        userId,
        kind: fd.get('kind') as (typeof KINDS)[number],
        descriptor: String(fd.get('descriptor') ?? ''),
        notes: (fd.get('notes') as string) || null,
      });
      (e.target as HTMLFormElement).reset();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
    }
  }

  async function onRevoke(id: string) {
    if (!confirm('Revoke this qualification?')) return;
    await revoke.mutateAsync({ qualificationId: id });
    router.refresh();
  }

  return (
    <section
      style={{
        marginTop: '1.25rem',
        padding: '1.1rem 1.25rem',
        background: 'rgba(18, 24, 38, 0.6)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 12,
      }}
    >
      <h2>Qualifications</h2>
      {error ? <p style={{ color: 'crimson' }}>{error}</p> : null}
      <form
        onSubmit={onCreate}
        style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}
      >
        <select name="kind" defaultValue="aircraft_type">
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
        <input name="descriptor" placeholder="e.g. C172" required />
        <input name="notes" placeholder="Notes" />
        <button type="submit">Add</button>
      </form>
      {quals.length === 0 ? (
        <p style={{ color: '#888' }}>No qualifications on record.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {quals.map((q) => (
            <li key={q.id} style={{ padding: '0.5rem 0', borderBottom: '1px solid #eee' }}>
              <strong>{q.kind}</strong>: {q.descriptor}
              {q.notes ? ` · ${q.notes}` : ''}{' '}
              <button type="button" onClick={() => onRevoke(q.id)}>
                Revoke
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
