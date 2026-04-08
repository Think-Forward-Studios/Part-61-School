'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';

export function CreateAircraftForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const createAircraft = trpc.admin.aircraft.create.useMutation();
  const addEngine = trpc.admin.aircraft.addEngine.useMutation();
  const createFlight = trpc.flightLog.create.useMutation();

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    try {
      // 1. create aircraft
      const ac = await createAircraft.mutateAsync({
        tailNumber: String(fd.get('tailNumber') ?? ''),
        make: (fd.get('make') as string) || null,
        model: (fd.get('model') as string) || null,
        year: fd.get('year') ? Number(fd.get('year')) : null,
      });
      // 2. add default single engine
      await addEngine.mutateAsync({
        aircraftId: ac.id,
        position: 'single',
        serialNumber: null,
        installedAt: null,
      });
      // 3. baseline flight log entry
      const hobbs = Number(fd.get('hobbs') ?? 0);
      const tach = Number(fd.get('tach') ?? 0);
      const airframe = Number(fd.get('airframe') ?? 0);
      await createFlight.mutateAsync({
        aircraftId: ac.id,
        flownAt: new Date(),
        hobbsOut: 0,
        hobbsIn: hobbs,
        tachOut: 0,
        tachIn: tach,
        airframeDelta: airframe,
        notes: 'Initial baseline',
        engineDeltas: [],
      });
      router.push(`/admin/aircraft/${ac.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '1rem' }}>
      {error ? <p style={{ color: 'crimson' }}>{error}</p> : null}
      <label>
        Tail number <input name="tailNumber" required placeholder="N12345" />
      </label>
      <label>
        Make <input name="make" placeholder="Cessna" />
      </label>
      <label>
        Model <input name="model" placeholder="172" />
      </label>
      <label>
        Year <input name="year" type="number" min="1900" max="2100" />
      </label>
      <fieldset>
        <legend>Initial clocks (baseline)</legend>
        <label>
          Hobbs <input name="hobbs" type="number" step="0.1" defaultValue="0" />
        </label>
        <label>
          Tach <input name="tach" type="number" step="0.1" defaultValue="0" />
        </label>
        <label>
          Airframe <input name="airframe" type="number" step="0.1" defaultValue="0" />
        </label>
      </fieldset>
      <button type="submit" disabled={busy}>
        {busy ? 'Creating…' : 'Create aircraft'}
      </button>
    </form>
  );
}
