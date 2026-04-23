'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';
import * as s from './_panelStyles';

interface ContactRow {
  id: string;
  name: string;
  relationship: string | null;
  phone: string | null;
  email: string | null;
  isPrimary: boolean;
}

export function EmergencyContactsPanel({
  userId,
  contacts,
}: {
  userId: string;
  contacts: ContactRow[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const create = trpc.people.emergencyContacts.create.useMutation();
  const del = trpc.people.emergencyContacts.delete.useMutation();

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    try {
      await create.mutateAsync({
        userId,
        name: String(fd.get('name') ?? ''),
        relationship: (fd.get('relationship') as string) || null,
        phone: (fd.get('phone') as string) || null,
        email: (fd.get('email') as string) || null,
        isPrimary: fd.get('isPrimary') === 'on',
      });
      (e.target as HTMLFormElement).reset();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
    }
  }

  async function onDelete(id: string) {
    if (!confirm('Delete this contact?')) return;
    await del.mutateAsync({ contactId: id });
    router.refresh();
  }

  return (
    <section style={s.section}>
      <h2 style={s.heading}>Emergency Contacts</h2>
      {error ? <p style={s.errorText}>{error}</p> : null}

      <form
        onSubmit={onCreate}
        style={{
          display: 'flex',
          gap: '0.5rem',
          flexWrap: 'wrap',
          alignItems: 'center',
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
        <input name="phone" placeholder="Phone" style={{ ...s.input, flex: '1 1 140px' }} />
        <input
          name="email"
          type="email"
          placeholder="Email"
          style={{ ...s.input, flex: '1 1 180px' }}
        />
        <label
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.35rem',
            color: '#cbd5e1',
            fontSize: '0.82rem',
            whiteSpace: 'nowrap',
          }}
        >
          <input type="checkbox" name="isPrimary" />
          Primary
        </label>
        <button type="submit" style={s.primaryButton} disabled={create.isPending}>
          {create.isPending ? 'Adding…' : 'Add'}
        </button>
      </form>

      {contacts.length === 0 ? (
        <p style={s.emptyText}>No emergency contacts on record.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: '0.5rem 0 0' }}>
          {contacts.map((c) => (
            <li key={c.id} style={s.listRow}>
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    flexWrap: 'wrap',
                  }}
                >
                  {c.isPrimary ? (
                    <span
                      style={{
                        display: 'inline-flex',
                        padding: '0.1rem 0.45rem',
                        background: 'rgba(251, 191, 36, 0.14)',
                        border: '1px solid rgba(251, 191, 36, 0.4)',
                        borderRadius: 999,
                        color: '#fbbf24',
                        fontSize: '0.65rem',
                        fontWeight: 700,
                        letterSpacing: '0.1em',
                        textTransform: 'uppercase',
                        fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                      }}
                    >
                      Primary
                    </span>
                  ) : null}
                  <strong style={{ color: '#f7f9fc' }}>{c.name}</strong>
                  <span style={{ color: '#94a3b8', fontSize: '0.82rem' }}>
                    ({c.relationship ?? '—'})
                  </span>
                </div>
                <div style={s.listRowMeta}>
                  {c.phone ?? '—'} · {c.email ?? '—'}
                </div>
              </div>
              <button type="button" onClick={() => onDelete(c.id)} style={s.danger}>
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
