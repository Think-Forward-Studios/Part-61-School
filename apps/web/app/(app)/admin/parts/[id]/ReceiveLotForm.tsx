'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';

export function ReceiveLotForm({ partId }: { partId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const receive = trpc.admin.parts.receiveLot.useMutation();

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const receivedQty = Number(fd.get('receivedQty'));
    if (!(receivedQty > 0)) {
      setError('Quantity must be positive.');
      return;
    }
    try {
      await receive.mutateAsync({
        partId,
        receivedQty,
        lotNumber: (fd.get('lotNumber') as string) || undefined,
        serialNumber: (fd.get('serialNumber') as string) || undefined,
        supplier: (fd.get('supplier') as string) || undefined,
        invoiceRef: (fd.get('invoiceRef') as string) || undefined,
      });
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Receive failed');
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          padding: '0.35rem 0.8rem',
          background: '#0070f3',
          color: 'white',
          border: 0,
          borderRadius: 3,
          cursor: 'pointer',
          fontSize: '0.85rem',
        }}
      >
        Receive new lot
      </button>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      style={{
        padding: '0.75rem',
        background: '#f8fafc',
        border: '1px solid #e5e7eb',
        borderRadius: 4,
        display: 'grid',
        gap: '0.5rem',
        maxWidth: 520,
      }}
    >
      <h3 style={{ margin: 0, fontSize: '0.9rem' }}>Receive lot</h3>
      <label style={{ fontSize: '0.8rem' }}>
        Quantity received
        <input name="receivedQty" type="number" step="any" required style={{ width: '100%' }} />
      </label>
      <label style={{ fontSize: '0.8rem' }}>
        Lot # (optional)
        <input name="lotNumber" style={{ width: '100%' }} />
      </label>
      <label style={{ fontSize: '0.8rem' }}>
        Serial # (optional)
        <input name="serialNumber" style={{ width: '100%' }} />
      </label>
      <label style={{ fontSize: '0.8rem' }}>
        Supplier
        <input name="supplier" style={{ width: '100%' }} />
      </label>
      <label style={{ fontSize: '0.8rem' }}>
        Invoice ref
        <input name="invoiceRef" style={{ width: '100%' }} />
      </label>
      {error ? <p style={{ color: 'crimson', fontSize: '0.8rem' }}>{error}</p> : null}
      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
        <button type="button" onClick={() => setOpen(false)}>
          Cancel
        </button>
        <button
          type="submit"
          disabled={receive.isPending}
          style={{
            padding: '0.3rem 0.8rem',
            background: '#16a34a',
            color: 'white',
            border: 0,
            borderRadius: 3,
            cursor: receive.isPending ? 'wait' : 'pointer',
          }}
        >
          {receive.isPending ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  );
}
