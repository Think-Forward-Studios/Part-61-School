'use client';

/**
 * AuditActions — client component for mark-resolved and run-now actions.
 *
 * When rendered without exceptionId, shows the "Run audit now" button.
 * When rendered with exceptionId, shows the "Mark resolved" button.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';

export function AuditActions({ exceptionId }: { exceptionId?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const markResolved = trpc.admin.audit.markResolved.useMutation();
  const runNow = trpc.admin.audit.runNow.useMutation();

  if (exceptionId) {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await markResolved.mutateAsync({ exceptionId });
            router.refresh();
          } finally {
            setBusy(false);
          }
        }}
        style={{
          fontSize: '0.8rem',
          padding: '0.2rem 0.5rem',
          border: '1px solid #d1d5db',
          borderRadius: 4,
          background: 'white',
          cursor: 'pointer',
        }}
      >
        {busy ? 'Resolving...' : 'Mark resolved'}
      </button>
    );
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const result = await runNow.mutateAsync();
          alert(`Audit complete. ${result.openCount} open exception(s) found.`);
          router.refresh();
        } finally {
          setBusy(false);
        }
      }}
      style={{
        fontSize: '0.85rem',
        padding: '0.35rem 0.75rem',
        border: '1px solid #2563eb',
        borderRadius: 4,
        background: '#2563eb',
        color: 'white',
        cursor: 'pointer',
        fontWeight: 500,
      }}
    >
      {busy ? 'Running...' : 'Run audit now'}
    </button>
  );
}
