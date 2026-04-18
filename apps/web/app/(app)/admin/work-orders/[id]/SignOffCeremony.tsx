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

const MONO: React.CSSProperties = {
  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
};

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
          padding: '0.85rem 1rem',
          border: '1px solid rgba(52, 211, 153, 0.4)',
          background: 'rgba(52, 211, 153, 0.08)',
          borderRadius: 12,
        }}
      >
        <strong style={{ color: '#34d399' }}>✓ Work order closed and signed off.</strong>
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
        padding: '1rem 1.25rem',
        background: '#0d1220',
        border: '1px solid rgba(248, 113, 113, 0.4)',
        borderRadius: 12,
      }}
    >
      <h2 style={{ margin: '0 0 0.5rem 0', color: '#f87171', fontSize: '0.95rem' }}>Sign-off</h2>
      <p style={{ fontSize: '0.85rem', color: '#cbd5e1' }}>
        Requires{' '}
        <strong style={{ color: '#f7f9fc' }}>{highestRequired === 'ia' ? 'IA' : 'A&P'}</strong>{' '}
        authority.
        {allTasksDone ? ' All tasks are complete.' : ' Not ready — complete every task first.'}
        {!userCanSign
          ? ` You are signed in as ${userAuthority ?? 'a non-mechanic'} — you cannot sign this work order.`
          : ''}
      </p>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        style={{
          padding: '0.65rem 1.4rem',
          background: disabled ? 'rgba(122, 134, 154, 0.12)' : 'rgba(248, 113, 113, 0.15)',
          color: disabled ? '#7a869a' : '#f87171',
          border: disabled ? '1px solid #293352' : '1px solid rgba(248, 113, 113, 0.5)',
          borderRadius: 8,
          fontSize: '0.82rem',
          fontWeight: 700,
          cursor: disabled ? 'not-allowed' : 'pointer',
          ...MONO,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
        }}
      >
        SIGN AND RETURN TO SERVICE
      </button>

      {open ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
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
              padding: '1.5rem',
              borderRadius: 12,
              maxWidth: 560,
              width: '90%',
              border: '1px solid rgba(248, 113, 113, 0.5)',
              color: '#cbd5e1',
            }}
          >
            <h3 style={{ margin: 0, color: '#f87171', fontSize: '1.05rem' }}>
              Sign and Return to Service
            </h3>
            <div
              style={{
                marginTop: '0.5rem',
                padding: '0.75rem',
                background: 'rgba(248, 113, 113, 0.08)',
                border: '1px solid rgba(248, 113, 113, 0.4)',
                borderRadius: 6,
                color: '#f87171',
                fontSize: '0.85rem',
              }}
            >
              <strong>THIS IS LEGALLY BINDING.</strong> By signing, your{' '}
              {highestRequired === 'ia' ? 'IA' : 'A&P'} certificate will be captured in an immutable
              snapshot. One sealed logbook entry will be written per applicable book (airframe /
              engine / prop). The aircraft may be cleared to fly when all other grounding causes are
              resolved.
            </div>

            <label
              style={{
                display: 'block',
                marginTop: '0.75rem',
                fontSize: '0.8rem',
                color: '#7a869a',
              }}
            >
              Logbook description (will be sealed into the book)
              <textarea
                name="description"
                required
                rows={4}
                style={{ width: '100%', marginTop: '0.25rem' }}
                placeholder="e.g. Performed 100-hour inspection per Cessna 172 service manual. All tasks complete, no discrepancies."
              />
            </label>

            <label
              style={{
                display: 'block',
                marginTop: '0.75rem',
                fontSize: '0.85rem',
                color: '#cbd5e1',
              }}
            >
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />{' '}
              I certify this work is complete and the aircraft is airworthy.
            </label>

            {error ? (
              <p style={{ color: '#f87171', fontSize: '0.85rem', marginTop: '0.5rem' }}>{error}</p>
            ) : null}

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
                  padding: '0.4rem 0.9rem',
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
                disabled={signOff.isPending || !confirmed}
                style={{
                  padding: '0.55rem 1.1rem',
                  background:
                    signOff.isPending || !confirmed
                      ? 'rgba(122, 134, 154, 0.12)'
                      : 'rgba(248, 113, 113, 0.15)',
                  color: signOff.isPending || !confirmed ? '#7a869a' : '#f87171',
                  border:
                    signOff.isPending || !confirmed
                      ? '1px solid #293352'
                      : '1px solid rgba(248, 113, 113, 0.5)',
                  borderRadius: 8,
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  cursor: signOff.isPending || !confirmed ? 'not-allowed' : 'pointer',
                  ...MONO,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
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
