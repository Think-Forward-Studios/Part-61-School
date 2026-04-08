'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';

interface ReleaseRow {
  id: string;
  name: string;
  relationship: string | null;
  notes: string | null;
}

export function InfoReleasePanel({
  userId,
  releases,
}: {
  userId: string;
  releases: ReleaseRow[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const create = trpc.people.infoReleases.create.useMutation();
  const revoke = trpc.people.infoReleases.revoke.useMutation();

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    try {
      await create.mutateAsync({
        userId,
        name: String(fd.get('name') ?? ''),
        relationship: (fd.get('relationship') as string) || null,
        notes: (fd.get('notes') as string) || null,
      });
      (e.target as HTMLFormElement).reset();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
    }
  }

  async function onRevoke(id: string) {
    if (!confirm('Revoke this authorization?')) return;
    await revoke.mutateAsync({ releaseId: id });
    router.refresh();
  }

  return (
    <section style={{ marginTop: '1rem', padding: '1rem', border: '1px solid #ddd', borderRadius: 6 }}>
      <h2>Information Release Authorizations</h2>
      {error ? <p style={{ color: 'crimson' }}>{error}</p> : null}
      <form onSubmit={onCreate} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <input name="name" placeholder="Name" required />
        <input name="relationship" placeholder="Relationship" />
        <input name="notes" placeholder="Notes" />
        <button type="submit">Authorize</button>
      </form>
      {releases.length === 0 ? (
        <p style={{ color: '#888' }}>No active releases.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {releases.map((r) => (
            <li key={r.id} style={{ padding: '0.5rem 0', borderBottom: '1px solid #eee' }}>
              <strong>{r.name}</strong> ({r.relationship ?? '—'}){' '}
              <button type="button" onClick={() => onRevoke(r.id)}>
                Revoke
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
