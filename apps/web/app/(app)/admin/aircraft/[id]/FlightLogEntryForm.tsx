'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';

interface Engine {
  id: string;
  position: string;
}

export function FlightLogEntryForm({
  aircraftId,
  engines,
}: {
  aircraftId: string;
  engines: Engine[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const create = trpc.flightLog.create.useMutation();

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    const hobbsOut = Number(fd.get('hobbsOut'));
    const hobbsIn = Number(fd.get('hobbsIn'));
    const tachOut = Number(fd.get('tachOut'));
    const tachIn = Number(fd.get('tachIn'));
    const airframeDelta = Number(fd.get('airframeDelta') ?? 0);

    if (hobbsIn < hobbsOut) {
      setError('hobbs in must be >= hobbs out');
      setBusy(false);
      return;
    }
    if (tachIn < tachOut) {
      setError('tach in must be >= tach out');
      setBusy(false);
      return;
    }

    const engineDeltas = engines.length > 1
      ? engines.map((eng) => ({
          engineId: eng.id,
          deltaHours: Number(fd.get(`engine_${eng.id}`) ?? 0),
        }))
      : engines.length === 1
        ? [{ engineId: engines[0]!.id, deltaHours: hobbsIn - hobbsOut }]
        : [];

    try {
      await create.mutateAsync({
        aircraftId,
        flownAt: new Date(),
        hobbsOut,
        hobbsIn,
        tachOut,
        tachIn,
        airframeDelta: airframeDelta || hobbsIn - hobbsOut,
        notes: (fd.get('notes') as string) || null,
        engineDeltas,
      });
      (e.target as HTMLFormElement).reset();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Log failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section style={{ marginTop: '1rem', padding: '1rem', border: '1px solid #ddd', borderRadius: 6 }}>
      <h2>Log a flight</h2>
      {error ? <p style={{ color: 'crimson' }}>{error}</p> : null}
      <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <label>
          Hobbs out <input name="hobbsOut" type="number" step="0.1" required />
        </label>
        <label>
          Hobbs in <input name="hobbsIn" type="number" step="0.1" required />
        </label>
        <label>
          Tach out <input name="tachOut" type="number" step="0.1" required />
        </label>
        <label>
          Tach in <input name="tachIn" type="number" step="0.1" required />
        </label>
        <label>
          Airframe delta <input name="airframeDelta" type="number" step="0.1" placeholder="auto" />
        </label>
        {engines.length > 1
          ? engines.map((eng) => (
              <label key={eng.id}>
                Engine {eng.position} delta{' '}
                <input name={`engine_${eng.id}`} type="number" step="0.1" defaultValue="0" />
              </label>
            ))
          : null}
        <label>
          Notes <input name="notes" />
        </label>
        <button type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Log flight'}
        </button>
      </form>
    </section>
  );
}
