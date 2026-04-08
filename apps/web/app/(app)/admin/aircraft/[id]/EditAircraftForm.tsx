'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';

export function EditAircraftForm({
  aircraftId,
  initial,
}: {
  aircraftId: string;
  initial: { tailNumber: string; make: string; model: string; year: number | null; equipmentNotes: string };
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const update = trpc.admin.aircraft.update.useMutation();
  const softDelete = trpc.admin.aircraft.softDelete.useMutation();

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setOk(false);
    const fd = new FormData(e.currentTarget);
    try {
      await update.mutateAsync({
        aircraftId,
        tailNumber: String(fd.get('tailNumber') ?? ''),
        make: (fd.get('make') as string) || null,
        model: (fd.get('model') as string) || null,
        year: fd.get('year') ? Number(fd.get('year')) : null,
        equipmentNotes: (fd.get('equipmentNotes') as string) || null,
      });
      setOk(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    }
  }

  async function onSoftDelete() {
    if (!confirm('Soft-delete this aircraft?')) return;
    try {
      await softDelete.mutateAsync({ aircraftId });
      router.push('/admin/aircraft');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  return (
    <section style={{ padding: '1rem', border: '1px solid #ddd', borderRadius: 6 }}>
      <h2>Aircraft Info</h2>
      <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {error ? <p style={{ color: 'crimson' }}>{error}</p> : null}
        {ok ? <p style={{ color: 'green' }}>Saved.</p> : null}
        <label>
          Tail <input name="tailNumber" defaultValue={initial.tailNumber} required />
        </label>
        <label>
          Make <input name="make" defaultValue={initial.make} />
        </label>
        <label>
          Model <input name="model" defaultValue={initial.model} />
        </label>
        <label>
          Year <input name="year" type="number" defaultValue={initial.year ?? ''} />
        </label>
        <label>
          Equipment notes <textarea name="equipmentNotes" defaultValue={initial.equipmentNotes} rows={3} />
        </label>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button type="submit">Save</button>
          <button type="button" onClick={onSoftDelete} style={{ background: '#d33', color: 'white' }}>
            Soft-delete
          </button>
        </div>
      </form>
    </section>
  );
}
