'use client';

/**
 * Inline Complete button + modal for a maintenance_item. Calls
 * admin.maintenance.complete which builds the signer snapshot server
 * side — a caller without sufficient mechanic authority gets a clear
 * FORBIDDEN error.
 */
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';

const MONO: React.CSSProperties = {
  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
};

export function CompleteMaintenanceButton({
  itemId,
  itemTitle,
}: {
  itemId: string;
  itemTitle: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const complete = trpc.admin.maintenance.complete.useMutation();

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const completedAt = String(fd.get('completedAt') ?? '');
    try {
      await complete.mutateAsync({
        itemId,
        completedAt: completedAt ? new Date(completedAt).toISOString() : undefined,
      });
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Complete failed');
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          padding: '0.3rem 0.7rem',
          background: 'rgba(52, 211, 153, 0.12)',
          color: '#34d399',
          border: '1px solid rgba(52, 211, 153, 0.35)',
          borderRadius: 6,
          cursor: 'pointer',
          fontSize: '0.7rem',
          ...MONO,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          fontWeight: 600,
        }}
      >
        Complete
      </button>
      {open ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <form
            onSubmit={onSubmit}
            style={{
              background: '#0d1220',
              padding: '1.25rem',
              borderRadius: 12,
              maxWidth: 480,
              width: '90%',
              border: '1px solid #1f2940',
              color: '#cbd5e1',
            }}
          >
            <h3 style={{ margin: 0, color: '#f7f9fc' }}>Complete: {itemTitle}</h3>
            <p style={{ fontSize: '0.85rem', color: '#7a869a' }}>
              Records compliance now with your mechanic certificate snapshot. Requires at least
              A&amp;P authority; annual inspections require IA.
            </p>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#7a869a' }}>
              Completed at (defaults to now)
              <input
                name="completedAt"
                type="datetime-local"
                style={{ width: '100%', marginTop: '0.25rem' }}
              />
            </label>
            {error ? <p style={{ color: '#f87171', fontSize: '0.85rem' }}>{error}</p> : null}
            <div
              style={{
                display: 'flex',
                gap: '0.5rem',
                justifyContent: 'flex-end',
                marginTop: '1rem',
              }}
            >
              <button
                type="button"
                onClick={() => setOpen(false)}
                style={{
                  padding: '0.35rem 0.8rem',
                  background: 'transparent',
                  color: '#cbd5e1',
                  border: '1px solid #293352',
                  borderRadius: 6,
                  fontSize: '0.72rem',
                  ...MONO,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={complete.isPending}
                style={{
                  padding: '0.45rem 0.95rem',
                  background: 'rgba(52, 211, 153, 0.15)',
                  color: '#34d399',
                  border: '1px solid rgba(52, 211, 153, 0.45)',
                  borderRadius: 6,
                  fontSize: '0.72rem',
                  ...MONO,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  fontWeight: 700,
                  cursor: complete.isPending ? 'wait' : 'pointer',
                }}
              >
                {complete.isPending ? 'Signing…' : 'Sign and record'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
