'use client';

/**
 * PassengerManifestPanel (FTR-06).
 *
 * Inline manifest editor used inside the DispatchModal. PIC and SIC
 * rows are auto-seeded from the reservation's instructor / student.
 * Additional passengers are added by the dispatcher. On submit the
 * parent calls dispatch.passengerManifestUpsert with the row array.
 */
import { useState } from 'react';

export type ManifestRow = {
  position: 'pic' | 'sic' | 'passenger';
  name: string;
  weightLbs: number | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  notes: string | null;
};

export function PassengerManifestPanel({
  rows,
  onChange,
}: {
  rows: ManifestRow[];
  onChange: (rows: ManifestRow[]) => void;
}) {
  const [draftName, setDraftName] = useState('');
  const [draftWeight, setDraftWeight] = useState('');

  function update(idx: number, patch: Partial<ManifestRow>) {
    const next = rows.slice();
    next[idx] = { ...next[idx]!, ...patch };
    onChange(next);
  }

  function remove(idx: number) {
    onChange(rows.filter((_, i) => i !== idx));
  }

  function addPassenger() {
    if (!draftName.trim()) return;
    const w = Number(draftWeight);
    onChange([
      ...rows,
      {
        position: 'passenger',
        name: draftName.trim(),
        weightLbs: isNaN(w) ? null : w,
        emergencyContactName: null,
        emergencyContactPhone: null,
        notes: null,
      },
    ]);
    setDraftName('');
    setDraftWeight('');
  }

  const TH: React.CSSProperties = {
    textAlign: 'left',
    padding: '0.5rem 0.6rem',
    fontFamily: '"JetBrains Mono", ui-monospace, monospace',
    fontSize: '0.65rem',
    letterSpacing: '0.15em',
    color: '#7a869a',
    textTransform: 'uppercase',
    fontWeight: 500,
    borderBottom: '1px solid #1f2940',
  };

  const TD: React.CSSProperties = {
    padding: '0.4rem 0.6rem',
    color: '#cbd5e1',
    fontSize: '0.82rem',
  };

  const inputStyle: React.CSSProperties = {
    background: '#0d1220',
    border: '1px solid #293352',
    color: '#f7f9fc',
    padding: '0.3rem 0.5rem',
    borderRadius: 4,
    fontFamily: '"JetBrains Mono", ui-monospace, monospace',
    fontSize: '0.78rem',
    width: '100%',
  };

  return (
    <div>
      <div
        style={{
          background: '#0d1220',
          border: '1px solid #1f2940',
          borderRadius: 8,
          overflow: 'hidden',
        }}
      >
        <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#121826' }}>
              <th style={TH}>Position</th>
              <th style={TH}>Name</th>
              <th style={TH}>Weight (lb)</th>
              <th style={TH}>EC name</th>
              <th style={TH}>EC phone</th>
              <th style={TH} />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #161d30' }}>
                <td
                  style={{
                    ...TD,
                    fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                    fontSize: '0.72rem',
                    letterSpacing: '0.1em',
                    color: '#38bdf8',
                    fontWeight: 600,
                  }}
                >
                  {r.position.toUpperCase()}
                </td>
                <td style={TD}>
                  <input
                    value={r.name}
                    onChange={(e) => update(i, { name: e.target.value })}
                    style={inputStyle}
                  />
                </td>
                <td style={TD}>
                  <input
                    type="number"
                    step="1"
                    value={r.weightLbs ?? ''}
                    onChange={(e) =>
                      update(i, {
                        weightLbs: e.target.value === '' ? null : Number(e.target.value),
                      })
                    }
                    style={{ ...inputStyle, width: 80 }}
                  />
                </td>
                <td style={TD}>
                  <input
                    value={r.emergencyContactName ?? ''}
                    onChange={(e) => update(i, { emergencyContactName: e.target.value || null })}
                    style={inputStyle}
                  />
                </td>
                <td style={TD}>
                  <input
                    value={r.emergencyContactPhone ?? ''}
                    onChange={(e) => update(i, { emergencyContactPhone: e.target.value || null })}
                    style={inputStyle}
                  />
                </td>
                <td style={TD}>
                  {r.position === 'passenger' ? (
                    <button
                      type="button"
                      onClick={() => remove(i)}
                      style={{
                        background: 'transparent',
                        color: '#f87171',
                        border: '1px solid rgba(248, 113, 113, 0.35)',
                        borderRadius: 4,
                        padding: '0.2rem 0.45rem',
                        cursor: 'pointer',
                        fontSize: '0.75rem',
                      }}
                    >
                      ✕
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: '0.6rem', display: 'flex', gap: '0.5rem' }}>
        <input
          placeholder="Passenger name"
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          style={{ ...inputStyle, flex: 1 }}
        />
        <input
          placeholder="Weight"
          type="number"
          value={draftWeight}
          onChange={(e) => setDraftWeight(e.target.value)}
          style={{ ...inputStyle, width: 90 }}
        />
        <button
          type="button"
          onClick={addPassenger}
          style={{
            padding: '0.35rem 0.85rem',
            background: 'rgba(56, 189, 248, 0.12)',
            color: '#38bdf8',
            border: '1px solid rgba(56, 189, 248, 0.35)',
            borderRadius: 6,
            fontSize: '0.72rem',
            fontFamily: '"JetBrains Mono", ui-monospace, monospace',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Add passenger
        </button>
      </div>
    </div>
  );
}
