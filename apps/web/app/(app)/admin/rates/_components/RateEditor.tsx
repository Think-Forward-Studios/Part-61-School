'use client';
import { useState } from 'react';
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

export function RateEditor() {
  const utils = trpc.useUtils();
  const rates = trpc.admin.rates.list.useQuery();
  const createMut = trpc.admin.rates.create.useMutation({
    onSuccess: () => {
      utils.admin.rates.list.invalidate();
      setAdding(false);
    },
  });
  const deleteMut = trpc.admin.rates.softDelete.useMutation({
    onSuccess: () => utils.admin.rates.list.invalidate(),
  });

  const [adding, setAdding] = useState(false);
  const [newKind, setNewKind] = useState<RateKind>('aircraft_wet');
  const [newAmount, setNewAmount] = useState('');
  const [newScope, setNewScope] = useState('');

  const activeRates = (rates.data ?? []).filter(
    (r: Record<string, unknown>) =>
      !(r.effectiveUntil ?? r.effective_until) ||
      new Date((r.effectiveUntil ?? r.effective_until) as string) > new Date(),
  );

  const fmtCents = (cents: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);

  return (
    <div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #e5e7eb', textAlign: 'left' }}>
            <th style={{ padding: '0.5rem' }}>Type</th>
            <th style={{ padding: '0.5rem' }}>Rate</th>
            <th style={{ padding: '0.5rem' }}>Scope</th>
            <th style={{ padding: '0.5rem' }}>Effective From</th>
            <th style={{ padding: '0.5rem' }}></th>
          </tr>
        </thead>
        <tbody>
          {activeRates.map((r: Record<string, unknown>) => (
            <tr key={r.id as string} style={{ borderBottom: '1px solid #f3f4f6' }}>
              <td style={{ padding: '0.5rem' }}>
                {RATE_KINDS.find((k) => k.value === (r.kind ?? r.rate_kind))?.label ??
                  (r.kind as string)}
              </td>
              <td style={{ padding: '0.5rem', fontWeight: 600 }}>
                {fmtCents(Number(r.amountCents ?? r.amount_cents ?? 0))}/hr
              </td>
              <td style={{ padding: '0.5rem', color: '#666' }}>
                {((r.aircraftMakeModel ?? r.aircraft_make_model) as string) ?? 'Default'}
              </td>
              <td style={{ padding: '0.5rem', color: '#666' }}>
                {new Date((r.effectiveFrom ?? r.effective_from) as string).toLocaleDateString()}
              </td>
              <td style={{ padding: '0.5rem' }}>
                <button
                  onClick={() => deleteMut.mutate({ rateId: r.id as string })}
                  disabled={deleteMut.isPending}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#dc2626',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                  }}
                >
                  Remove
                </button>
              </td>
            </tr>
          ))}
          {!activeRates.length && (
            <tr>
              <td colSpan={5} style={{ padding: '1rem', color: '#999', textAlign: 'center' }}>
                No rates configured
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {adding ? (
        <div
          style={{
            marginTop: '1rem',
            padding: '1rem',
            border: '1px solid #e5e7eb',
            borderRadius: 8,
          }}
        >
          <h3 style={{ margin: '0 0 0.5rem', fontSize: '0.9rem' }}>Add Rate</h3>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <select
              value={newKind}
              onChange={(e) => setNewKind(e.target.value as RateKind)}
              style={{ padding: '0.35rem', borderRadius: 4, border: '1px solid #d1d5db' }}
            >
              {RATE_KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="Amount ($/hr)"
              value={newAmount}
              onChange={(e) => setNewAmount(e.target.value)}
              style={{
                padding: '0.35rem',
                borderRadius: 4,
                border: '1px solid #d1d5db',
                width: 120,
              }}
            />
            <input
              type="text"
              placeholder="Make/Model (optional)"
              value={newScope}
              onChange={(e) => setNewScope(e.target.value)}
              style={{
                padding: '0.35rem',
                borderRadius: 4,
                border: '1px solid #d1d5db',
                width: 180,
              }}
            />
            <button
              onClick={() => {
                const cents = Math.round(parseFloat(newAmount) * 100);
                if (isNaN(cents) || cents < 0) return;
                createMut.mutate({
                  kind: newKind,
                  amountCents: cents,
                  aircraftMakeModel: newScope || undefined,
                });
              }}
              disabled={createMut.isPending}
              style={{
                padding: '0.35rem 0.75rem',
                background: '#2563eb',
                color: 'white',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              Save
            </button>
            <button
              onClick={() => setAdding(false)}
              style={{
                padding: '0.35rem 0.75rem',
                background: '#f3f4f6',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          style={{
            marginTop: '0.75rem',
            padding: '0.5rem 1rem',
            background: '#2563eb',
            color: 'white',
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer',
          }}
        >
          + Add Rate
        </button>
      )}
    </div>
  );
}
