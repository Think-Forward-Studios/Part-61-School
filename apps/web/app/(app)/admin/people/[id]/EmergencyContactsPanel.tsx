'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';

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
    <section
      style={{
        marginTop: '1.25rem',
        padding: '1.1rem 1.25rem',
        background: 'rgba(18, 24, 38, 0.6)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 12,
      }}
    >
      <h2>Emergency Contacts</h2>
      {error ? <p style={{ color: 'crimson' }}>{error}</p> : null}
      <form
        onSubmit={onCreate}
        style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}
      >
        <input name="name" placeholder="Name" required />
        <input name="relationship" placeholder="Relationship" />
        <input name="phone" placeholder="Phone" />
        <input name="email" type="email" placeholder="Email" />
        <label>
          <input type="checkbox" name="isPrimary" /> Primary
        </label>
        <button type="submit">Add</button>
      </form>
      {contacts.length === 0 ? (
        <p style={{ color: '#888' }}>No emergency contacts on record.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {contacts.map((c) => (
            <li key={c.id} style={{ padding: '0.5rem 0', borderBottom: '1px solid #eee' }}>
              {c.isPrimary ? <strong>[PRIMARY] </strong> : null}
              <strong>{c.name}</strong> ({c.relationship ?? '—'})
              <div style={{ fontSize: '0.85rem', color: '#555' }}>
                {c.phone ?? '—'} · {c.email ?? '—'}
              </div>
              <button type="button" onClick={() => onDelete(c.id)}>
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
