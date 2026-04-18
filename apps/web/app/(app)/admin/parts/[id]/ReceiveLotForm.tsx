'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';

const CHIP_BASE: React.CSSProperties = {
  padding: '0.4rem 0.9rem',
  borderRadius: 6,
  fontSize: '0.72rem',
  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  fontWeight: 600,
  cursor: 'pointer',
  border: '1px solid',
};

const LABEL: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.25rem',
  fontSize: '0.7rem',
  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
  color: '#7a869a',
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
};

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
          ...CHIP_BASE,
          background: 'rgba(56, 189, 248, 0.12)',
          color: '#38bdf8',
          borderColor: 'rgba(56, 189, 248, 0.35)',
        }}
      >
        + Receive new lot
      </button>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      style={{
        padding: '1rem 1.1rem',
        background: '#05070e',
        border: '1px solid #1f2940',
        borderRadius: 8,
        display: 'grid',
        gap: '0.7rem',
        maxWidth: 560,
      }}
    >
      <h3
        style={{
          margin: 0,
          fontSize: '0.75rem',
          fontFamily: '"JetBrains Mono", ui-monospace, monospace',
          color: '#7a869a',
          textTransform: 'uppercase',
          letterSpacing: '0.15em',
          fontWeight: 500,
        }}
      >
        Receive lot
      </h3>
      <label style={LABEL}>
        Quantity received
        <input name="receivedQty" type="number" step="any" required />
      </label>
      <label style={LABEL}>
        Lot # (optional)
        <input name="lotNumber" />
      </label>
      <label style={LABEL}>
        Serial # (optional)
        <input name="serialNumber" />
      </label>
      <label style={LABEL}>
        Supplier
        <input name="supplier" />
      </label>
      <label style={LABEL}>
        Invoice ref
        <input name="invoiceRef" />
      </label>
      {error ? (
        <p
          style={{
            color: '#f87171',
            fontSize: '0.75rem',
            margin: 0,
            fontFamily: '"JetBrains Mono", ui-monospace, monospace',
          }}
        >
          {error}
        </p>
      ) : null}
      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={() => setOpen(false)}
          style={{
            ...CHIP_BASE,
            background: 'transparent',
            color: '#7a869a',
            borderColor: '#1f2940',
          }}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={receive.isPending}
          style={{
            ...CHIP_BASE,
            background: 'rgba(52, 211, 153, 0.12)',
            color: '#34d399',
            borderColor: 'rgba(52, 211, 153, 0.35)',
            cursor: receive.isPending ? 'wait' : 'pointer',
            opacity: receive.isPending ? 0.6 : 1,
          }}
        >
          {receive.isPending ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  );
}
