'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';
import * as s from './_panelStyles';

interface ReleaseRow {
  id: string;
  name: string;
  relationship: string | null;
  notes: string | null;
}

export function InfoReleasePanel({ userId, releases }: { userId: string; releases: ReleaseRow[] }) {
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
    <section style={s.section}>
      <h2 style={s.heading}>Information Release Authorizations</h2>
      {error ? <p style={s.errorText}>{error}</p> : null}

      <form
        onSubmit={onCreate}
        style={{
          display: 'flex',
          gap: '0.5rem',
          flexWrap: 'wrap',
          marginTop: '0.85rem',
          marginBottom: '0.5rem',
        }}
      >
        <input name="name" placeholder="Name" required style={{ ...s.input, flex: '1 1 160px' }} />
        <input
          name="relationship"
          placeholder="Relationship"
          style={{ ...s.input, flex: '1 1 140px' }}
        />
        <input name="notes" placeholder="Notes" style={{ ...s.input, flex: '1 1 160px' }} />
        <button type="submit" style={s.primaryButton} disabled={create.isPending}>
          {create.isPending ? 'Saving…' : 'Authorize'}
        </button>
      </form>

      {releases.length === 0 ? (
        <p style={s.emptyText}>No active releases.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: '0.5rem 0 0' }}>
          {releases.map((r) => (
            <li key={r.id} style={s.listRow}>
              <div style={{ minWidth: 0 }}>
                <strong style={{ color: '#f7f9fc' }}>{r.name}</strong>{' '}
                <span style={{ color: '#94a3b8', fontSize: '0.82rem' }}>
                  ({r.relationship ?? '—'})
                </span>
                {r.notes ? <div style={s.listRowMeta}>{r.notes}</div> : null}
              </div>
              <button type="button" onClick={() => onRevoke(r.id)} style={s.danger}>
                Revoke
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
