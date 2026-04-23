'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';
import * as s from './_panelStyles';

interface Engine {
  id: string;
  position: string;
}

type EntryKind = 'flight' | 'baseline';

export function FlightLogEntryForm({
  aircraftId,
  engines,
}: {
  aircraftId: string;
  engines: Engine[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<EntryKind>('flight');
  const create = trpc.flightLog.create.useMutation();

  const isBaseline = kind === 'baseline';

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setOk(false);
    setBusy(true);
    const fd = new FormData(e.currentTarget);

    const hobbsOutRaw = fd.get('hobbsOut');
    const hobbsInRaw = fd.get('hobbsIn');
    const tachOutRaw = fd.get('tachOut');
    const tachInRaw = fd.get('tachIn');
    const airframeRaw = fd.get('airframeDelta');
    const notes = (fd.get('notes') as string) || null;

    // Baseline entries set the "as-of" Hobbs / Tach / Airframe floor.
    // Only the *_in values apply (the *_out fields are hidden for
    // baseline). We send hobbsOut = hobbsIn so the sum-of-deltas logic
    // in aircraft_current_totals treats this as a zero-delta anchor.
    if (isBaseline) {
      const hobbs = hobbsInRaw ? Number(hobbsInRaw) : null;
      const tach = tachInRaw ? Number(tachInRaw) : null;
      const airframe = airframeRaw ? Number(airframeRaw) : 0;
      try {
        await create.mutateAsync({
          aircraftId,
          kind: 'baseline',
          flownAt: new Date(),
          hobbsOut: hobbs,
          hobbsIn: hobbs,
          tachOut: tach,
          tachIn: tach,
          airframeDelta: airframe,
          notes: notes ?? 'Manual baseline',
          engineDeltas: [],
        });
        (e.target as HTMLFormElement).reset();
        setKind('flight');
        setOk(true);
        router.refresh();
        setTimeout(() => setOk(false), 3000);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Baseline failed');
      } finally {
        setBusy(false);
      }
      return;
    }

    // Normal flight path.
    const hobbsOut = Number(hobbsOutRaw);
    const hobbsIn = Number(hobbsInRaw);
    const tachOut = Number(tachOutRaw);
    const tachIn = Number(tachInRaw);
    const airframeDelta = airframeRaw ? Number(airframeRaw) : 0;

    if (hobbsIn < hobbsOut) {
      setError('Hobbs in must be ≥ Hobbs out');
      setBusy(false);
      return;
    }
    if (tachIn < tachOut) {
      setError('Tach in must be ≥ Tach out');
      setBusy(false);
      return;
    }

    const engineDeltas =
      engines.length > 1
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
        kind: 'flight',
        flownAt: new Date(),
        hobbsOut,
        hobbsIn,
        tachOut,
        tachIn,
        airframeDelta: airframeDelta || hobbsIn - hobbsOut,
        notes,
        engineDeltas,
      });
      (e.target as HTMLFormElement).reset();
      setOk(true);
      router.refresh();
      setTimeout(() => setOk(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Log failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section style={s.section}>
      <h2 style={s.heading}>{isBaseline ? 'Set current totals (baseline)' : 'Log a flight'}</h2>
      <p style={{ ...s.listRowMeta, marginTop: '0.4rem' }}>
        {isBaseline
          ? 'Establishes the current Hobbs / Tach / Airframe floor. Use this when importing a paper logbook or reconciling after an audit.'
          : "Records a flight. Hobbs/Tach/Airframe totals roll forward from each entry's delta."}
      </p>

      <form onSubmit={onSubmit} style={{ marginTop: '0.85rem' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '0.75rem',
          }}
        >
          <Field label="Entry kind">
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as EntryKind)}
              style={s.select}
            >
              <option value="flight">Flight</option>
              <option value="baseline">Baseline (set current totals)</option>
            </select>
          </Field>

          {!isBaseline ? (
            <Field label="Hobbs out">
              <input name="hobbsOut" type="number" step="0.1" required style={s.input} />
            </Field>
          ) : null}

          <Field label={isBaseline ? 'Current Hobbs' : 'Hobbs in'}>
            <input name="hobbsIn" type="number" step="0.1" required style={s.input} />
          </Field>

          {!isBaseline ? (
            <Field label="Tach out">
              <input name="tachOut" type="number" step="0.1" required style={s.input} />
            </Field>
          ) : null}

          <Field label={isBaseline ? 'Current Tach' : 'Tach in'}>
            <input name="tachIn" type="number" step="0.1" required style={s.input} />
          </Field>

          <Field label={isBaseline ? 'Current Airframe' : 'Airframe delta (auto)'}>
            <input
              name="airframeDelta"
              type="number"
              step="0.1"
              placeholder={isBaseline ? '0.0' : 'auto'}
              style={s.input}
            />
          </Field>

          {!isBaseline && engines.length > 1
            ? engines.map((eng) => (
                <Field key={eng.id} label={`Engine ${eng.position} delta`}>
                  <input
                    name={`engine_${eng.id}`}
                    type="number"
                    step="0.1"
                    defaultValue="0"
                    style={s.input}
                  />
                </Field>
              ))
            : null}
        </div>

        <div style={{ marginTop: '0.75rem' }}>
          <Field label="Notes">
            <input name="notes" placeholder="Optional notes" style={s.input} />
          </Field>
        </div>

        <div
          style={{
            display: 'flex',
            gap: '0.6rem',
            alignItems: 'center',
            marginTop: '1rem',
            flexWrap: 'wrap',
          }}
        >
          <button type="submit" style={s.primaryButton} disabled={busy}>
            {busy ? 'Saving…' : isBaseline ? 'Save baseline' : 'Log flight'}
          </button>
          {error ? <span style={{ color: '#f87171', fontSize: '0.82rem' }}>{error}</span> : null}
          {ok ? <span style={{ color: '#4ade80', fontSize: '0.82rem' }}>Saved.</span> : null}
        </div>
      </form>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
      <label style={s.fieldLabel}>{label}</label>
      {children}
    </div>
  );
}
