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
          padding: '0.25rem 0.6rem',
          background: '#0070f3',
          color: 'white',
          border: 0,
          borderRadius: 3,
          cursor: 'pointer',
          fontSize: '0.8rem',
        }}
      >
        Complete
      </button>
      {open ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <form
            onSubmit={onSubmit}
            style={{
              background: 'white',
              padding: '1.25rem',
              borderRadius: 6,
              maxWidth: 480,
              width: '90%',
            }}
          >
            <h3 style={{ margin: 0 }}>Complete: {itemTitle}</h3>
            <p style={{ fontSize: '0.85rem', color: '#6b7280' }}>
              Records compliance now with your mechanic certificate snapshot. Requires at
              least A&amp;P authority; annual inspections require IA.
            </p>
            <label style={{ display: 'block', fontSize: '0.85rem' }}>
              Completed at (defaults to now)
              <input
                name="completedAt"
                type="datetime-local"
                style={{ width: '100%', marginTop: '0.25rem' }}
              />
            </label>
            {error ? (
              <p style={{ color: 'crimson', fontSize: '0.85rem' }}>{error}</p>
            ) : null}
            <div
              style={{
                display: 'flex',
                gap: '0.5rem',
                justifyContent: 'flex-end',
                marginTop: '1rem',
              }}
            >
              <button type="button" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button
                type="submit"
                disabled={complete.isPending}
                style={{
                  padding: '0.4rem 0.9rem',
                  background: '#16a34a',
                  color: 'white',
                  border: 0,
                  borderRadius: 4,
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
