'use client';

import { useMemo, useState } from 'react';
import { trpc } from '@/lib/trpc/client';

const RATE_KINDS = [
  { value: 'aircraft_wet', label: 'Aircraft (Wet)' },
  { value: 'aircraft_dry', label: 'Aircraft (Dry)' },
  { value: 'instructor', label: 'Instructor' },
  { value: 'ground_instructor', label: 'Ground Instruction' },
  { value: 'simulator', label: 'Simulator' },
  { value: 'surcharge_fixed', label: 'Surcharge (Fixed)' },
] as const;

type RateKind = (typeof RATE_KINDS)[number]['value'];

/**
 * Does this rate kind pick an aircraft from the fleet?
 *   aircraft_wet / aircraft_dry — yes, scope to one specific tail
 *   simulator                    — no; schools enter make/model text
 *   everything else              — no
 */
function isAircraftKind(k: RateKind): boolean {
  return k === 'aircraft_wet' || k === 'aircraft_dry';
}

/**
 * Does this rate kind pick an instructor from staff?
 *   instructor / ground_instructor — yes, scope to one staff member
 *   everything else                — no
 */
function isInstructorKind(k: RateKind): boolean {
  return k === 'instructor' || k === 'ground_instructor';
}

function isSurchargeKind(k: RateKind): boolean {
  return k === 'surcharge_fixed';
}

export function RateEditor() {
  const utils = trpc.useUtils();
  const rates = trpc.admin.rates.list.useQuery();

  // Aircraft list for the aircraft_wet / aircraft_dry picker.
  const aircraftQuery = trpc.admin.aircraft.list.useQuery({ limit: 500, offset: 0 });
  // Instructor list for the instructor / ground_instructor picker.
  const instructorsQuery = trpc.admin.people.list.useQuery({
    role: 'instructor',
    status: 'active',
    limit: 500,
    offset: 0,
  });

  const createMut = trpc.admin.rates.create.useMutation({
    onSuccess: () => {
      utils.admin.rates.list.invalidate();
      setAdding(false);
      resetForm();
    },
  });
  const deleteMut = trpc.admin.rates.softDelete.useMutation({
    onSuccess: () => utils.admin.rates.list.invalidate(),
  });

  const [adding, setAdding] = useState(false);
  const [newKind, setNewKind] = useState<RateKind>('aircraft_wet');
  const [newAmount, setNewAmount] = useState('');
  const [newAircraftId, setNewAircraftId] = useState<string>('');
  const [newInstructorId, setNewInstructorId] = useState<string>('');
  const [newSimulatorModel, setNewSimulatorModel] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);

  function resetForm() {
    setNewAmount('');
    setNewAircraftId('');
    setNewInstructorId('');
    setNewSimulatorModel('');
    setNewNotes('');
    setSaveError(null);
  }

  // Lookup maps so the table can render tail numbers and instructor
  // names instead of raw UUIDs. Built from the admin.aircraft.list and
  // admin.people.list queries we already fire for the add form.
  const aircraftList = aircraftQuery.data ?? [];
  const instructorList = (instructorsQuery.data?.rows ?? []) as Array<{
    id: string;
    email: string;
    first_name?: string | null;
    last_name?: string | null;
    full_name?: string | null;
  }>;
  const aircraftById = useMemo(() => {
    const m = new Map<string, { tailNumber: string; make: string | null; model: string | null }>();
    for (const a of aircraftList) {
      m.set(a.id, {
        tailNumber: a.tailNumber,
        make: a.make ?? null,
        model: a.model ?? null,
      });
    }
    return m;
  }, [aircraftList]);
  const instructorById = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of instructorList) {
      const name =
        [p.first_name, p.last_name].filter(Boolean).join(' ').trim() ||
        p.full_name?.trim() ||
        p.email;
      m.set(p.id, name);
    }
    return m;
  }, [instructorList]);

  const activeRates = (rates.data ?? []).filter(
    (r: Record<string, unknown>) =>
      !(r.effectiveUntil ?? r.effective_until) ||
      new Date((r.effectiveUntil ?? r.effective_until) as string) > new Date(),
  );

  const fmtCents = (cents: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);

  /** Describe the rate's scope — tail, instructor, sim model, or default. */
  function describeScope(r: Record<string, unknown>): string {
    const kind = (r.kind ?? r.rate_kind) as RateKind;
    const aircraftId = (r.aircraftId ?? r.aircraft_id) as string | null;
    const instructorId = (r.instructorId ?? r.instructor_id) as string | null;
    const mmText = (r.aircraftMakeModel ?? r.aircraft_make_model) as string | null;
    if (isAircraftKind(kind) && aircraftId) {
      const ac = aircraftById.get(aircraftId);
      if (ac) {
        const mm = [ac.make, ac.model].filter(Boolean).join(' ');
        return ac.tailNumber + (mm ? ` · ${mm}` : '');
      }
      return '—';
    }
    if (isInstructorKind(kind) && instructorId) {
      return instructorById.get(instructorId) ?? '—';
    }
    if (mmText) return mmText;
    if (isSurchargeKind(kind)) return 'Flat fee';
    return 'Default (all)';
  }

  function describeDescription(r: Record<string, unknown>): string {
    const notes = (r.notes as string | null) ?? '';
    return notes.trim();
  }

  function rateUnitSuffix(kind: RateKind): string {
    return isSurchargeKind(kind) ? '' : '/hr';
  }

  function handleSave() {
    setSaveError(null);
    const cents = Math.round(parseFloat(newAmount) * 100);
    if (isNaN(cents) || cents < 0) {
      setSaveError('Enter a valid dollar amount.');
      return;
    }
    // Kind-specific validation.
    if (isAircraftKind(newKind) && !newAircraftId) {
      setSaveError('Pick an aircraft from the fleet.');
      return;
    }
    if (isInstructorKind(newKind) && !newInstructorId) {
      setSaveError('Pick an instructor.');
      return;
    }
    if (isSurchargeKind(newKind) && !newNotes.trim()) {
      setSaveError('Enter what the fee is for.');
      return;
    }

    createMut.mutate({
      kind: newKind,
      amountCents: cents,
      aircraftId: isAircraftKind(newKind) ? newAircraftId : undefined,
      instructorId: isInstructorKind(newKind) ? newInstructorId : undefined,
      aircraftMakeModel:
        newKind === 'simulator' && newSimulatorModel.trim() ? newSimulatorModel.trim() : undefined,
      notes: newNotes.trim() || undefined,
    });
  }

  return (
    <div style={{ marginTop: '1.25rem' }}>
      <div
        style={{
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 12,
          overflow: 'hidden',
          background: 'rgba(18, 24, 38, 0.5)',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
          <thead>
            <tr
              style={{
                background: 'rgba(9, 13, 24, 0.6)',
                color: '#7a869a',
                fontSize: '0.72rem',
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
              }}
            >
              <th style={thStyle}>Type</th>
              <th style={thStyle}>Rate</th>
              <th style={thStyle}>Applies to</th>
              <th style={thStyle}>Description</th>
              <th style={thStyle}>Effective from</th>
              <th style={{ ...thStyle, textAlign: 'right' }} />
            </tr>
          </thead>
          <tbody>
            {activeRates.map((r: Record<string, unknown>) => {
              const kind = (r.kind ?? r.rate_kind) as RateKind;
              return (
                <tr key={r.id as string} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={tdStyle}>
                    {RATE_KINDS.find((k) => k.value === kind)?.label ?? (kind as string)}
                  </td>
                  <td style={{ ...tdStyle, fontWeight: 700, color: '#fbbf24' }}>
                    {fmtCents(Number(r.amountCents ?? r.amount_cents ?? 0))}
                    {rateUnitSuffix(kind)}
                  </td>
                  <td style={{ ...tdStyle, color: '#cbd5e1' }}>{describeScope(r)}</td>
                  <td style={{ ...tdStyle, color: '#94a3b8' }}>{describeDescription(r) || '—'}</td>
                  <td style={{ ...tdStyle, color: '#94a3b8' }}>
                    {new Date((r.effectiveFrom ?? r.effective_from) as string).toLocaleDateString()}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    <button
                      type="button"
                      onClick={() => deleteMut.mutate({ rateId: r.id as string })}
                      disabled={deleteMut.isPending}
                      style={removeButtonStyle}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              );
            })}
            {!activeRates.length && (
              <tr>
                <td
                  colSpan={6}
                  style={{
                    padding: '1.5rem',
                    color: '#7a869a',
                    textAlign: 'center',
                    fontSize: '0.88rem',
                  }}
                >
                  No rates configured
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {adding ? (
        <div
          style={{
            marginTop: '1rem',
            padding: '1.25rem',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 12,
            background: 'rgba(18, 24, 38, 0.6)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
          }}
        >
          <h3
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
            Add rate
          </h3>

          <div style={formRow}>
            <label style={formLabel}>Type</label>
            <select
              value={newKind}
              onChange={(e) => {
                setNewKind(e.target.value as RateKind);
                // Clear scope fields that don't apply to the new kind
                setNewAircraftId('');
                setNewInstructorId('');
                setNewSimulatorModel('');
                setSaveError(null);
              }}
              style={inputStyle}
            >
              {RATE_KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          </div>

          {isAircraftKind(newKind) ? (
            <div style={formRow}>
              <label style={formLabel}>Aircraft</label>
              <select
                value={newAircraftId}
                onChange={(e) => setNewAircraftId(e.target.value)}
                style={inputStyle}
              >
                <option value="">
                  {aircraftQuery.isLoading ? 'Loading fleet…' : 'Select an aircraft…'}
                </option>
                {aircraftList.map((a) => {
                  const mm = [a.make, a.model].filter(Boolean).join(' ');
                  return (
                    <option key={a.id} value={a.id}>
                      {a.tailNumber}
                      {mm ? ` — ${mm}` : ''}
                    </option>
                  );
                })}
              </select>
            </div>
          ) : null}

          {isInstructorKind(newKind) ? (
            <div style={formRow}>
              <label style={formLabel}>Instructor</label>
              <select
                value={newInstructorId}
                onChange={(e) => setNewInstructorId(e.target.value)}
                style={inputStyle}
              >
                <option value="">
                  {instructorsQuery.isLoading ? 'Loading staff…' : 'Select an instructor…'}
                </option>
                {instructorList.map((p) => {
                  const name =
                    [p.first_name, p.last_name].filter(Boolean).join(' ').trim() ||
                    p.full_name?.trim() ||
                    p.email;
                  return (
                    <option key={p.id} value={p.id}>
                      {name} ({p.email})
                    </option>
                  );
                })}
              </select>
            </div>
          ) : null}

          {newKind === 'simulator' ? (
            <div style={formRow}>
              <label style={formLabel}>Simulator make/model</label>
              <input
                type="text"
                value={newSimulatorModel}
                onChange={(e) => setNewSimulatorModel(e.target.value)}
                placeholder="e.g. Redbird FMX"
                style={inputStyle}
              />
            </div>
          ) : null}

          <div style={formRow}>
            <label style={formLabel}>
              {isSurchargeKind(newKind) ? 'Amount ($)' : 'Amount ($/hr)'}
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder={isSurchargeKind(newKind) ? '25.00' : '185.00'}
              value={newAmount}
              onChange={(e) => setNewAmount(e.target.value)}
              style={inputStyle}
            />
          </div>

          <div style={formRow}>
            <label style={formLabel}>
              {isSurchargeKind(newKind) ? 'What is this fee for?' : 'Description (optional)'}
            </label>
            <input
              type="text"
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
              placeholder={
                isSurchargeKind(newKind)
                  ? 'Late cancellation fee, fuel surcharge, …'
                  : 'Notes — visible in this table'
              }
              style={inputStyle}
              maxLength={500}
            />
          </div>

          {saveError ? (
            <div style={{ color: '#f87171', fontSize: '0.82rem' }}>{saveError}</div>
          ) : null}

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              type="button"
              onClick={handleSave}
              disabled={createMut.isPending}
              style={primaryButtonStyle}
            >
              {createMut.isPending ? 'Saving…' : 'Save rate'}
            </button>
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                resetForm();
              }}
              style={ghostButtonStyle}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            setAdding(true);
            resetForm();
          }}
          style={{
            marginTop: '1rem',
            ...primaryButtonStyle,
          }}
        >
          + Add rate
        </button>
      )}
    </div>
  );
}

// --- styles ---------------------------------------------------------------

const thStyle: React.CSSProperties = {
  padding: '0.7rem 0.9rem',
  textAlign: 'left',
  fontWeight: 600,
};

const tdStyle: React.CSSProperties = {
  padding: '0.75rem 0.9rem',
  color: '#e2e8f0',
};

const formRow: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '180px 1fr',
  gap: '1rem',
  alignItems: 'center',
};

const formLabel: React.CSSProperties = {
  fontSize: '0.85rem',
  color: '#cbd5e1',
  fontWeight: 500,
};

const inputStyle: React.CSSProperties = {
  height: '2.4rem',
  background: 'rgba(9, 13, 24, 0.85)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 8,
  color: '#e2e8f0',
  padding: '0 0.75rem',
  fontSize: '0.9rem',
  outline: 'none',
  width: '100%',
};

const primaryButtonStyle: React.CSSProperties = {
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

const ghostButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  height: '2.3rem',
  padding: '0 1rem',
  background: 'rgba(9, 13, 24, 0.85)',
  color: '#cbd5e1',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 8,
  fontSize: '0.88rem',
  fontWeight: 600,
  cursor: 'pointer',
};

const removeButtonStyle: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid rgba(248, 113, 113, 0.35)',
  color: '#fca5a5',
  borderRadius: 6,
  padding: '0.3rem 0.7rem',
  fontSize: '0.78rem',
  cursor: 'pointer',
  fontWeight: 600,
};
