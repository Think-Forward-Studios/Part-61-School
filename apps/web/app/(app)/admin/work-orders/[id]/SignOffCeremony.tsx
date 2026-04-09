'use client';

/**
 * SignOffCeremony — ceremonial sign-off button for work orders.
 *
 * Disabled until every task is complete. Opens a modal with
 * bold red styling, legal-binding language, an explicit confirm
 * checkbox, and the caller's highest-matching authority.
 */
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';

export function SignOffCeremony({
  workOrderId,
  allTasksDone,
  alreadyClosed,
  highestRequired,
  userCanSign,
  userAuthority,
}: {
  workOrderId: string;
  allTasksDone: boolean;
  alreadyClosed: boolean;
  highestRequired: string;
  userCanSign: boolean;
  userAuthority: 'a_and_p' | 'ia' | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const signOff = trpc.admin.workOrders.signOff.useMutation();

  if (alreadyClosed) {
    return (
      <section
        style={{
          marginTop: '1rem',
          padding: '0.75rem',
          border: '1px solid #16a34a',
          background: '#f0fdf4',
          borderRadius: 6,
        }}
      >
        <strong style={{ color: '#16a34a' }}>✓ Work order closed and signed off.</strong>
      </section>
    );
  }

  const disabled = !allTasksDone || !userCanSign;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const description = String(fd.get('description') ?? '').trim();
    if (!description) {
      setError('Description is required for the logbook entry.');
      return;
    }
    if (!confirmed) {
      setError('You must explicitly certify before signing.');
      return;
    }
    try {
      await signOff.mutateAsync({ workOrderId, description });
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-off failed');
    }
  }

  return (
    <section
      style={{
        marginTop: '1rem',
        padding: '0.75rem',
        border: '2px solid #b91c1c',
        borderRadius: 6,
      }}
    >
      <h2 style={{ margin: '0 0 0.5rem 0', color: '#7f1d1d' }}>Sign-off</h2>
      <p style={{ fontSize: '0.85rem', color: '#6b7280' }}>
        Requires <strong>{highestRequired === 'ia' ? 'IA' : 'A&P'}</strong> authority.
        {allTasksDone
          ? ' All tasks are complete.'
          : ' Not ready — complete every task first.'}
        {!userCanSign
          ? ` You are signed in as ${userAuthority ?? 'a non-mechanic'} — you cannot sign this work order.`
          : ''}
      </p>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        style={{
          padding: '0.75rem 1.5rem',
          background: disabled ? '#9ca3af' : '#b91c1c',
          color: 'white',
          border: disabled ? '0' : '3px solid #7f1d1d',
          borderRadius: 4,
          fontSize: '1rem',
          fontWeight: 700,
          cursor: disabled ? 'not-allowed' : 'pointer',
          letterSpacing: '0.03em',
        }}
      >
        SIGN AND RETURN TO SERVICE
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
              background: 'white',
              padding: '1.5rem',
              borderRadius: 6,
              maxWidth: 560,
              width: '90%',
              border: '3px solid #b91c1c',
            }}
          >
            <h3 style={{ margin: 0, color: '#7f1d1d' }}>
              Sign and Return to Service
            </h3>
            <div
              style={{
                marginTop: '0.5rem',
                padding: '0.75rem',
                background: '#fef2f2',
                border: '2px solid #b91c1c',
                borderRadius: 4,
                color: '#7f1d1d',
                fontSize: '0.85rem',
              }}
            >
              <strong>THIS IS LEGALLY BINDING.</strong> By signing, your{' '}
              {highestRequired === 'ia' ? 'IA' : 'A&P'} certificate will be captured in an
              immutable snapshot. One sealed logbook entry will be written per applicable
              book (airframe / engine / prop). The aircraft may be cleared to fly when all
              other grounding causes are resolved.
            </div>

            <label style={{ display: 'block', marginTop: '0.75rem', fontSize: '0.85rem' }}>
              Logbook description (will be sealed into the book)
              <textarea
                name="description"
                required
                rows={4}
                style={{ width: '100%', marginTop: '0.25rem' }}
                placeholder="e.g. Performed 100-hour inspection per Cessna 172 service manual. All tasks complete, no discrepancies."
              />
            </label>

            <label style={{ display: 'block', marginTop: '0.75rem', fontSize: '0.85rem' }}>
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />{' '}
              I certify this work is complete and the aircraft is airworthy.
            </label>

            {error ? (
              <p style={{ color: 'crimson', fontSize: '0.85rem', marginTop: '0.5rem' }}>
                {error}
              </p>
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
                disabled={signOff.isPending || !confirmed}
                style={{
                  padding: '0.6rem 1.2rem',
                  background: '#b91c1c',
                  color: 'white',
                  border: '3px solid #7f1d1d',
                  borderRadius: 4,
                  fontWeight: 700,
                  cursor: signOff.isPending || !confirmed ? 'not-allowed' : 'pointer',
                }}
              >
                {signOff.isPending ? 'Signing…' : 'Sign off'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}
