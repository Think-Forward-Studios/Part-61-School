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

  return (
    <div>
      <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#f3f4f6' }}>
            <th style={{ textAlign: 'left', padding: '0.25rem' }}>Position</th>
            <th style={{ textAlign: 'left', padding: '0.25rem' }}>Name</th>
            <th style={{ textAlign: 'left', padding: '0.25rem' }}>Weight (lb)</th>
            <th style={{ textAlign: 'left', padding: '0.25rem' }}>EC name</th>
            <th style={{ textAlign: 'left', padding: '0.25rem' }}>EC phone</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td style={{ padding: '0.25rem' }}>{r.position.toUpperCase()}</td>
              <td style={{ padding: '0.25rem' }}>
                <input
                  value={r.name}
                  onChange={(e) => update(i, { name: e.target.value })}
                />
              </td>
              <td style={{ padding: '0.25rem' }}>
                <input
                  type="number"
                  step="1"
                  value={r.weightLbs ?? ''}
                  onChange={(e) =>
                    update(i, {
                      weightLbs: e.target.value === '' ? null : Number(e.target.value),
                    })
                  }
                  style={{ width: 70 }}
                />
              </td>
              <td style={{ padding: '0.25rem' }}>
                <input
                  value={r.emergencyContactName ?? ''}
                  onChange={(e) =>
                    update(i, { emergencyContactName: e.target.value || null })
                  }
                />
              </td>
              <td style={{ padding: '0.25rem' }}>
                <input
                  value={r.emergencyContactPhone ?? ''}
                  onChange={(e) =>
                    update(i, { emergencyContactPhone: e.target.value || null })
                  }
                />
              </td>
              <td style={{ padding: '0.25rem' }}>
                {r.position === 'passenger' ? (
                  <button type="button" onClick={() => remove(i)}>
                    ✕
                  </button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem' }}>
        <input
          placeholder="Passenger name"
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
        />
        <input
          placeholder="Weight"
          type="number"
          value={draftWeight}
          onChange={(e) => setDraftWeight(e.target.value)}
          style={{ width: 80 }}
        />
        <button type="button" onClick={addPassenger}>
          Add passenger
        </button>
      </div>
    </div>
  );
}
