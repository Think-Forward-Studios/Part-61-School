'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';

export function EditRoomForm({
  roomId,
  initial,
}: {
  roomId: string;
  initial: { name: string; capacity: number | null; features: string[] };
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const updateMut = trpc.admin.rooms.update.useMutation();
  const deleteMut = trpc.admin.rooms.softDelete.useMutation();

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    try {
      await updateMut.mutateAsync({
        roomId,
        name: String(fd.get('name') ?? ''),
        capacity: fd.get('capacity') ? Number(fd.get('capacity')) : null,
        features: String(fd.get('features') ?? '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      });
      router.push('/admin/rooms');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!confirm('Delete this room?')) return;
    setBusy(true);
    try {
      await deleteMut.mutateAsync({ roomId });
      router.push('/admin/rooms');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}
    >
      {error ? <p style={{ color: 'crimson' }}>{error}</p> : null}
      <label>
        Name <input name="name" defaultValue={initial.name} required />
      </label>
      <label>
        Capacity{' '}
        <input
          name="capacity"
          type="number"
          min={0}
          defaultValue={initial.capacity ?? ''}
        />
      </label>
      <label>
        Features{' '}
        <input name="features" defaultValue={initial.features.join(', ')} />
      </label>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={onDelete} disabled={busy}>
          Delete
        </button>
      </div>
    </form>
  );
}
