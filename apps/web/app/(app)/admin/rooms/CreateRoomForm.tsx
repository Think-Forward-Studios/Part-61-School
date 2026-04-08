'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';

export function CreateRoomForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const createMut = trpc.admin.rooms.create.useMutation();

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    try {
      await createMut.mutateAsync({
        name: String(fd.get('name') ?? ''),
        capacity: fd.get('capacity')
          ? Number(fd.get('capacity'))
          : null,
        features: String(fd.get('features') ?? '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      });
      router.refresh();
      (e.currentTarget as HTMLFormElement).reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxWidth: 400 }}
    >
      {error ? <p style={{ color: 'crimson' }}>{error}</p> : null}
      <label>
        Name <input name="name" required />
      </label>
      <label>
        Capacity <input name="capacity" type="number" min={0} />
      </label>
      <label>
        Features (comma-separated) <input name="features" placeholder="projector, whiteboard" />
      </label>
      <button type="submit" disabled={busy}>
        {busy ? 'Creating…' : 'Create room'}
      </button>
    </form>
  );
}
