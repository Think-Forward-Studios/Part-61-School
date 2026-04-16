'use client';
import { useSearchParams, useRouter } from 'next/navigation';

function defaultFrom(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}
function defaultTo(): string {
  return new Date().toISOString().slice(0, 10);
}

export function DateRangeFilter() {
  const params = useSearchParams();
  const router = useRouter();
  const from = params.get('from') ?? defaultFrom();
  const to = params.get('to') ?? defaultTo();

  function update(key: string, val: string) {
    const sp = new URLSearchParams(params.toString());
    sp.set(key, val);
    router.replace('?' + sp.toString(), { scroll: false });
  }

  return (
    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
      <label style={{ fontSize: '0.8rem', color: '#666' }}>From</label>
      <input
        type="date"
        value={from}
        onChange={(e) => update('from', e.target.value)}
        style={{
          padding: '0.3rem',
          borderRadius: 4,
          border: '1px solid #d1d5db',
          fontSize: '0.85rem',
        }}
      />
      <label style={{ fontSize: '0.8rem', color: '#666' }}>To</label>
      <input
        type="date"
        value={to}
        onChange={(e) => update('to', e.target.value)}
        style={{
          padding: '0.3rem',
          borderRadius: 4,
          border: '1px solid #d1d5db',
          fontSize: '0.85rem',
        }}
      />
    </div>
  );
}
