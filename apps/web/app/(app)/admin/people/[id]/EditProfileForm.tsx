'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';

export function EditProfileForm({
  userId,
  initial,
}: {
  userId: string;
  initial: { email: string; firstName: string; lastName: string; phone: string; notes: string };
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const update = trpc.admin.people.update.useMutation();
  const softDelete = trpc.admin.people.softDelete.useMutation();

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setOk(false);
    const fd = new FormData(e.currentTarget);
    try {
      await update.mutateAsync({
        userId,
        email: String(fd.get('email') ?? ''),
        firstName: String(fd.get('firstName') ?? ''),
        lastName: String(fd.get('lastName') ?? ''),
        phone: (fd.get('phone') as string) || null,
        notes: (fd.get('notes') as string) || null,
      });
      setOk(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    }
  }

  async function onSoftDelete() {
    if (!confirm('Soft-delete this user? They will lose access.')) return;
    try {
      await softDelete.mutateAsync({ userId });
      router.push('/admin/people');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  return (
    <section style={{ marginTop: '1rem', padding: '1rem', border: '1px solid #ddd', borderRadius: 6 }}>
      <h2>Profile</h2>
      <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {error ? <p style={{ color: 'crimson' }}>{error}</p> : null}
        {ok ? <p style={{ color: 'green' }}>Saved.</p> : null}
        <label>
          Email <input name="email" type="email" defaultValue={initial.email} required />
        </label>
        <label>
          First name <input name="firstName" defaultValue={initial.firstName} />
        </label>
        <label>
          Last name <input name="lastName" defaultValue={initial.lastName} />
        </label>
        <label>
          Phone <input name="phone" defaultValue={initial.phone} />
        </label>
        <label>
          Notes <textarea name="notes" defaultValue={initial.notes} rows={3} />
        </label>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button type="submit">Save</button>
          <button type="button" onClick={onSoftDelete} style={{ background: '#d33', color: 'white' }}>
            Soft-delete user
          </button>
        </div>
      </form>
    </section>
  );
}
