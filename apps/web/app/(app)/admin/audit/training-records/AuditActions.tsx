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
          padding: '0.3rem 0.7rem',
          background: 'rgba(52, 211, 153, 0.12)',
          color: '#34d399',
          border: '1px solid rgba(52, 211, 153, 0.35)',
          borderRadius: 6,
          fontSize: '0.7rem',
          fontFamily: '"JetBrains Mono", ui-monospace, monospace',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          fontWeight: 600,
          cursor: busy ? 'not-allowed' : 'pointer',
          opacity: busy ? 0.5 : 1,
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
        padding: '0.55rem 0.95rem',
        background: 'linear-gradient(180deg, #fbbf24 0%, #f59e0b 100%)',
        color: '#0a0e1a',
        border: 'none',
        borderRadius: 8,
        fontSize: '0.78rem',
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        cursor: busy ? 'not-allowed' : 'pointer',
        opacity: busy ? 0.6 : 1,
        boxShadow: '0 4px 14px rgba(251, 191, 36, 0.25), 0 1px 0 rgba(255, 255, 255, 0.15) inset',
      }}
    >
      {busy ? 'Running...' : 'Run audit now'}
    </button>
  );
}
