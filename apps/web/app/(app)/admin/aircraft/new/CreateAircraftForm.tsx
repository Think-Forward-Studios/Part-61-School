'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';

const ENGINE_POSITIONS = ['single', 'left', 'right', 'center', 'n1', 'n2', 'n3', 'n4'] as const;

const EQUIPMENT_TAGS = [
  'ifr_equipped',
  'complex',
  'high_performance',
  'glass_panel',
  'autopilot',
  'ads_b_out',
  'ads_b_in',
  'gtn_650',
  'gtn_750',
  'g1000',
  'g3x',
  'garmin_530',
  'kln_94',
  'tail_dragger',
  'retractable_gear',
] as const;
type Tag = (typeof EQUIPMENT_TAGS)[number];

export function CreateAircraftForm({
  schoolHomeAirport,
  schoolHomeAirportName,
}: {
  schoolHomeAirport: string | null;
  schoolHomeAirportName: string | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());

  const createAircraft = trpc.admin.aircraft.create.useMutation();
  const addEngine = trpc.admin.aircraft.addEngine.useMutation();
  const setEquipment = trpc.admin.aircraft.setEquipment.useMutation();
  const createFlight = trpc.flightLog.create.useMutation();

  function toggleTag(tag: string) {
    const next = new Set(selectedTags);
    if (next.has(tag)) next.delete(tag);
    else next.add(tag);
    setSelectedTags(next);
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    try {
      // 1. Create the aircraft row.
      const ac = await createAircraft.mutateAsync({
        tailNumber: String(fd.get('tailNumber') ?? '').toUpperCase(),
        make: (fd.get('make') as string) || null,
        model: (fd.get('model') as string) || null,
        year: fd.get('year') ? Number(fd.get('year')) : null,
        equipmentNotes: (fd.get('equipmentNotes') as string) || null,
        homeAirport: (fd.get('homeAirport') as string)?.trim() || null,
      });

      // 2. Attach the initial engine with its position + optional S/N.
      await addEngine.mutateAsync({
        aircraftId: ac.id,
        position: (fd.get('enginePosition') as (typeof ENGINE_POSITIONS)[number]) ?? 'single',
        serialNumber: (fd.get('engineSerial') as string) || null,
        installedAt: null,
      });

      // 3. Equipment tag set (only if the admin picked any).
      if (selectedTags.size > 0) {
        await setEquipment.mutateAsync({
          aircraftId: ac.id,
          tags: [...selectedTags] as Tag[],
        });
      }

      // 4. Baseline flight log entry so Hobbs/Tach/Airframe surface
      //    immediately on the detail page. Admin can later add another
      //    baseline via the detail page's Log-a-flight form.
      const hobbs = Number(fd.get('hobbs') ?? 0);
      const tach = Number(fd.get('tach') ?? 0);
      const airframe = Number(fd.get('airframe') ?? 0);
      await createFlight.mutateAsync({
        aircraftId: ac.id,
        kind: 'baseline',
        flownAt: new Date(),
        hobbsOut: hobbs,
        hobbsIn: hobbs,
        tachOut: tach,
        tachIn: tach,
        airframeDelta: airframe,
        notes: 'Initial baseline (aircraft creation)',
        engineDeltas: [],
      });

      router.push(`/admin/aircraft/${ac.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setBusy(false);
    }
  }

  const schoolFallback = schoolHomeAirport
    ? schoolHomeAirportName
      ? `${schoolHomeAirport} · ${schoolHomeAirportName}`
      : schoolHomeAirport
    : 'no school home airport set';

  return (
    <form
      onSubmit={onSubmit}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '1.25rem',
        marginTop: '1.25rem',
      }}
    >
      {/* Identity */}
      <Card title="Identity">
        <Grid>
          <Field label="Tail number" hint="Uppercased on save.">
            <input
              name="tailNumber"
              required
              placeholder="N12345"
              maxLength={20}
              style={inputStyle}
              onChange={(e) => (e.target.value = e.target.value.toUpperCase())}
            />
          </Field>
          <Field
            label="Home airfield (ICAO)"
            hint={`Blank → inherits from school: ${schoolFallback}`}
          >
            <input
              name="homeAirport"
              placeholder={schoolHomeAirport ?? 'KBHM'}
              maxLength={80}
              style={inputStyle}
              onChange={(e) => (e.target.value = e.target.value.toUpperCase())}
            />
          </Field>
          <Field label="Make">
            <input name="make" placeholder="Cessna, Piper, Bell…" style={inputStyle} />
          </Field>
          <Field label="Model">
            <input name="model" placeholder="172, PA-28, 206L…" style={inputStyle} />
          </Field>
          <Field label="Year">
            <input
              name="year"
              type="number"
              min={1900}
              max={2100}
              placeholder="2005"
              style={inputStyle}
            />
          </Field>
        </Grid>
      </Card>

      {/* Engine */}
      <Card title="Engine">
        <Grid>
          <Field label="Position">
            <select name="enginePosition" defaultValue="single" style={selectStyle}>
              {ENGINE_POSITIONS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Serial number (optional)">
            <input name="engineSerial" placeholder="e.g. 217-4539-B" style={inputStyle} />
          </Field>
        </Grid>
        <p style={hintStyle}>
          Additional engines (twin, multi) can be added from the aircraft detail page after create.
        </p>
      </Card>

      {/* Equipment tags */}
      <Card title="Equipment tags">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          {EQUIPMENT_TAGS.map((t) => {
            const on = selectedTags.has(t);
            return (
              <button
                key={t}
                type="button"
                onClick={() => toggleTag(t)}
                style={{
                  padding: '0.3rem 0.75rem',
                  borderRadius: 999,
                  border: on
                    ? '1px solid rgba(251, 191, 36, 0.5)'
                    : '1px solid rgba(255,255,255,0.12)',
                  background: on ? 'rgba(251, 191, 36, 0.15)' : 'rgba(9, 13, 24, 0.85)',
                  color: on ? '#fbbf24' : '#cbd5e1',
                  cursor: 'pointer',
                  fontSize: '0.78rem',
                  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                  letterSpacing: '0.03em',
                  fontWeight: on ? 700 : 500,
                  transition: 'background 0.15s, border-color 0.15s, color 0.15s',
                }}
              >
                {t}
              </button>
            );
          })}
        </div>
        <div style={{ marginTop: '0.9rem' }}>
          <Field label="Equipment notes">
            <textarea
              name="equipmentNotes"
              rows={3}
              placeholder="Avionics specifics, STCs, special-purpose gear not covered by the tags above…"
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
      </Card>

      {/* Initial clocks */}
      <Card title="Initial clocks (baseline)">
        <Grid>
          <Field label="Hobbs">
            <input
              name="hobbs"
              type="number"
              step="0.1"
              min="0"
              defaultValue="0"
              style={inputStyle}
            />
          </Field>
          <Field label="Tach">
            <input
              name="tach"
              type="number"
              step="0.1"
              min="0"
              defaultValue="0"
              style={inputStyle}
            />
          </Field>
          <Field label="Airframe">
            <input
              name="airframe"
              type="number"
              step="0.1"
              min="0"
              defaultValue="0"
              style={inputStyle}
            />
          </Field>
        </Grid>
        <p style={hintStyle}>
          Recorded as a baseline flight-log entry so the detail page shows these as the current
          totals. You can log more baselines later if you need to re-anchor.
        </p>
      </Card>

      <div
        style={{
          display: 'flex',
          gap: '0.6rem',
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <button type="submit" style={primaryButton} disabled={busy}>
          {busy ? 'Creating…' : 'Create aircraft'}
        </button>
        {error ? <span style={{ color: '#f87171', fontSize: '0.85rem' }}>{error}</span> : null}
      </div>
    </form>
  );
}

// --- layout primitives ---------------------------------------------------

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      style={{
        padding: '1.1rem 1.25rem',
        background: 'rgba(18, 24, 38, 0.6)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 12,
      }}
    >
      <h2
        style={{
          margin: 0,
          marginBottom: '0.85rem',
          fontSize: '0.72rem',
          fontFamily: '"JetBrains Mono", ui-monospace, monospace',
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: '#7a869a',
          fontWeight: 600,
        }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '1rem',
      }}
    >
      {children}
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
      <label style={labelStyle}>{label}</label>
      {children}
      {hint ? <span style={hintStyle}>{hint}</span> : null}
    </div>
  );
}

// --- styles --------------------------------------------------------------

const labelStyle: React.CSSProperties = {
  fontSize: '0.68rem',
  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: '#7a869a',
  fontWeight: 600,
};

const hintStyle: React.CSSProperties = {
  fontSize: '0.72rem',
  color: '#7a869a',
  lineHeight: 1.4,
  margin: '0.35rem 0 0',
};

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

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  appearance: 'auto',
  cursor: 'pointer',
};

const primaryButton: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  height: '2.5rem',
  padding: '0 1.25rem',
  background: 'linear-gradient(135deg, #fbbf24, #f59e0b)',
  color: '#0a0e1a',
  border: 'none',
  borderRadius: 8,
  fontSize: '0.92rem',
  fontWeight: 700,
  cursor: 'pointer',
  letterSpacing: '0.01em',
};
