'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';

interface BaseOption {
  id: string;
  name: string;
}

interface EditInitial {
  tailNumber: string;
  make: string;
  model: string;
  year: number | null;
  equipmentNotes: string;
  baseId: string;
}

export function EditAircraftForm({
  aircraftId,
  bases,
  initial,
}: {
  aircraftId: string;
  bases: BaseOption[];
  initial: EditInitial;
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
        baseId: String(fd.get('baseId') ?? ''),
      });
      setOk(true);
      router.refresh();
      setTimeout(() => setOk(false), 3000);
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
    <section
      style={{
        marginTop: '1.25rem',
        padding: '1.1rem 1.25rem',
        background: 'rgba(18, 24, 38, 0.6)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 12,
      }}
    >
      <h2
        style={{
          margin: 0,
          fontSize: '0.72rem',
          fontFamily: '"JetBrains Mono", ui-monospace, monospace',
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: '#7a869a',
          fontWeight: 600,
        }}
      >
        Aircraft Info
      </h2>

      <form onSubmit={onSubmit} style={{ marginTop: '1rem' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '1rem',
          }}
        >
          <Field label="Tail number" htmlFor="edit-tailNumber">
            <input
              id="edit-tailNumber"
              name="tailNumber"
              defaultValue={initial.tailNumber}
              required
              style={inputStyle}
            />
          </Field>

          <Field label="Home base" htmlFor="edit-baseId">
            <select
              id="edit-baseId"
              name="baseId"
              defaultValue={initial.baseId}
              required
              style={inputStyle}
            >
              {bases.length === 0 ? (
                <option value="" disabled>
                  No bases available
                </option>
              ) : null}
              {bases.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Make" htmlFor="edit-make">
            <input
              id="edit-make"
              name="make"
              defaultValue={initial.make}
              placeholder="Cessna, Piper, Bell…"
              style={inputStyle}
            />
          </Field>

          <Field label="Model" htmlFor="edit-model">
            <input
              id="edit-model"
              name="model"
              defaultValue={initial.model}
              placeholder="172, PA-28, 206L…"
              style={inputStyle}
            />
          </Field>

          <Field label="Year" htmlFor="edit-year">
            <input
              id="edit-year"
              name="year"
              type="number"
              defaultValue={initial.year ?? ''}
              min={1900}
              max={2100}
              style={inputStyle}
            />
          </Field>
        </div>

        <div style={{ marginTop: '1rem' }}>
          <Field label="Equipment notes" htmlFor="edit-equipmentNotes">
            <textarea
              id="edit-equipmentNotes"
              name="equipmentNotes"
              defaultValue={initial.equipmentNotes}
              rows={3}
              placeholder="Avionics, IFR certification, autopilot, specific STCs…"
              style={{
                ...inputStyle,
                height: 'auto',
                padding: '0.6rem 0.75rem',
                minHeight: '4rem',
                resize: 'vertical',
                fontFamily: 'inherit',
              }}
            />
          </Field>
        </div>

        <div
          style={{
            display: 'flex',
            gap: '0.6rem',
            marginTop: '1.25rem',
            alignItems: 'center',
          }}
        >
          <button type="submit" style={primaryButton} disabled={update.isPending}>
            {update.isPending ? 'Saving…' : 'Save changes'}
          </button>
          <button type="button" onClick={onSoftDelete} style={dangerButton}>
            Soft-delete aircraft
          </button>
          {error ? <span style={{ color: '#f87171', fontSize: '0.82rem' }}>{error}</span> : null}
          {ok ? <span style={{ color: '#4ade80', fontSize: '0.82rem' }}>Saved.</span> : null}
        </div>
      </form>
    </section>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
      <label
        htmlFor={htmlFor}
        style={{
          fontSize: '0.68rem',
          fontFamily: '"JetBrains Mono", ui-monospace, monospace',
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: '#7a869a',
          fontWeight: 600,
        }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  height: '2.3rem',
  background: 'rgba(9, 13, 24, 0.85)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 8,
  color: '#e2e8f0',
  padding: '0 0.75rem',
  fontSize: '0.88rem',
  outline: 'none',
  width: '100%',
};

const primaryButton: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  height: '2.3rem',
  padding: '0 1rem',
  background: 'linear-gradient(135deg, #fbbf24, #f59e0b)',
  color: '#0a0e1a',
  border: 'none',
  borderRadius: 8,
  fontSize: '0.88rem',
  fontWeight: 700,
  cursor: 'pointer',
  letterSpacing: '0.01em',
};

const dangerButton: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  height: '2.3rem',
  padding: '0 1rem',
  background: 'transparent',
  border: '1px solid rgba(248, 113, 113, 0.4)',
  color: '#fca5a5',
  borderRadius: 8,
  fontSize: '0.82rem',
  fontWeight: 600,
  cursor: 'pointer',
};
