'use client';

/**
 * SquawkActions — client-side state-machine transitions.
 *
 * Renders only the buttons valid for the current status + user
 * authority. Server enforces real authority via buildSignerSnapshot in
 * the tRPC router — the UI hides for hygiene, not security.
 */
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';

type Status =
  | 'open'
  | 'triaged'
  | 'deferred'
  | 'in_work'
  | 'fixed'
  | 'returned_to_service'
  | 'cancelled';

type Authority = 'a_and_p' | 'ia' | null;

export function SquawkActions({
  squawkId,
  status,
  userAuthority,
}: {
  squawkId: string;
  status: Status;
  userAuthority: Authority;
}) {
  const router = useRouter();
  const [triageOpen, setTriageOpen] = useState(false);
  const [rtsOpen, setRtsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const triage = trpc.admin.squawks.triage.useMutation();
  const moveToInWork = trpc.admin.squawks.moveToInWork.useMutation();
  const markFixed = trpc.admin.squawks.markFixed.useMutation();
  const rts = trpc.admin.squawks.returnToService.useMutation();
  const cancel = trpc.admin.squawks.cancel.useMutation();

  const isMechanic = userAuthority === 'a_and_p' || userAuthority === 'ia';

  async function doMove(
    fn: () => Promise<unknown>,
    msg: string,
  ): Promise<void> {
    setError(null);
    try {
      await fn();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : msg);
    }
  }

  async function submitTriage(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const action = String(fd.get('action') ?? 'in_work') as 'defer' | 'in_work';
    const deferredUntil = (fd.get('deferredUntil') as string) || undefined;
    const deferralJustification =
      (fd.get('deferralJustification') as string) || undefined;
    await doMove(
      () =>
        triage.mutateAsync({
          squawkId,
          action,
          deferredUntil,
          deferralJustification,
        }),
      'Triage failed',
    );
    setTriageOpen(false);
  }

  async function submitRts() {
    await doMove(
      () => rts.mutateAsync({ squawkId }),
      'Return-to-service failed',
    );
    setRtsOpen(false);
  }

  async function submitCancel() {
    const reason = prompt('Cancel reason?') ?? '';
    if (!reason.trim()) return;
    await doMove(
      () => cancel.mutateAsync({ squawkId, reason: reason.trim() }),
      'Cancel failed',
    );
  }

  if (status === 'returned_to_service' || status === 'cancelled') {
    return (
      <p style={{ marginTop: '1rem', color: '#6b7280', fontSize: '0.85rem' }}>
        Squawk is closed ({status.replace('_', ' ')}). No further actions.
      </p>
    );
  }

  return (
    <section
      style={{
        marginTop: '1rem',
        padding: '0.75rem',
        border: '1px solid #e5e7eb',
        borderRadius: 6,
      }}
    >
      <h2 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem' }}>Actions</h2>
      {!isMechanic ? (
        <p style={{ color: '#b45309', fontSize: '0.85rem' }}>
          You need mechanic authority (A&amp;P or IA) to sign squawk transitions.
        </p>
      ) : null}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        {status === 'open' && isMechanic ? (
          <button type="button" onClick={() => setTriageOpen(true)} style={btn('#0070f3')}>
            Triage
          </button>
        ) : null}
        {(status === 'triaged' || status === 'deferred') && isMechanic ? (
          <button
            type="button"
            onClick={() =>
              doMove(
                () => moveToInWork.mutateAsync({ squawkId }),
                'Move to in-work failed',
              )
            }
            style={btn('#0369a1')}
          >
            Start work
          </button>
        ) : null}
        {status === 'in_work' && isMechanic ? (
          <button
            type="button"
            onClick={() =>
              doMove(() => markFixed.mutateAsync({ squawkId }), 'Mark fixed failed')
            }
            style={btn('#16a34a')}
          >
            Mark fixed
          </button>
        ) : null}
        {status === 'fixed' && isMechanic ? (
          <button
            type="button"
            onClick={() => setRtsOpen(true)}
            style={{
              ...btn('#b91c1c'),
              border: '3px solid #7f1d1d',
              padding: '0.6rem 1.2rem',
              fontSize: '0.95rem',
            }}
          >
            Sign and Return to Service
          </button>
        ) : null}
        <button type="button" onClick={submitCancel} style={btn('#6b7280')}>
          Cancel
        </button>
      </div>
      {error ? (
        <p style={{ color: 'crimson', fontSize: '0.85rem', marginTop: '0.5rem' }}>
          {error}
        </p>
      ) : null}

      {triageOpen ? (
        <Modal onClose={() => setTriageOpen(false)}>
          <form onSubmit={submitTriage}>
            <h3 style={{ margin: 0 }}>Triage squawk</h3>
            <label style={{ display: 'block', marginTop: '0.5rem', fontSize: '0.85rem' }}>
              Action
              <select name="action" defaultValue="in_work" style={{ width: '100%' }}>
                <option value="in_work">Start work immediately</option>
                <option value="defer">Defer (MEL)</option>
              </select>
            </label>
            <label style={{ display: 'block', marginTop: '0.5rem', fontSize: '0.85rem' }}>
              Deferred until (optional)
              <input name="deferredUntil" type="date" style={{ width: '100%' }} />
            </label>
            <label style={{ display: 'block', marginTop: '0.5rem', fontSize: '0.85rem' }}>
              Deferral justification (required if deferring)
              <textarea name="deferralJustification" rows={3} style={{ width: '100%' }} />
            </label>
            <div
              style={{
                display: 'flex',
                gap: '0.5rem',
                justifyContent: 'flex-end',
                marginTop: '1rem',
              }}
            >
              <button type="button" onClick={() => setTriageOpen(false)}>
                Cancel
              </button>
              <button type="submit" style={btn('#0070f3')}>
                Triage
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {rtsOpen ? (
        <Modal onClose={() => setRtsOpen(false)}>
          <div>
            <h3 style={{ margin: 0, color: '#7f1d1d' }}>
              Sign and Return to Service
            </h3>
            <p
              style={{
                marginTop: '0.5rem',
                padding: '0.5rem',
                background: '#fef2f2',
                border: '2px solid #b91c1c',
                borderRadius: 4,
                color: '#7f1d1d',
                fontSize: '0.85rem',
              }}
            >
              This is legally binding. Your mechanic certificate will be captured in an
              immutable snapshot and the aircraft may be cleared to fly when all other
              grounding causes are resolved.
            </p>
            <div
              style={{
                display: 'flex',
                gap: '0.5rem',
                justifyContent: 'flex-end',
                marginTop: '1rem',
              }}
            >
              <button type="button" onClick={() => setRtsOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                onClick={submitRts}
                disabled={rts.isPending}
                style={{
                  ...btn('#b91c1c'),
                  border: '3px solid #7f1d1d',
                  padding: '0.6rem 1.2rem',
                }}
              >
                {rts.isPending ? 'Signing…' : 'I certify this work is complete'}
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
    </section>
  );
}

function Modal({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      onClick={onClose}
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
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'white',
          padding: '1.25rem',
          borderRadius: 6,
          maxWidth: 520,
          width: '90%',
        }}
      >
        {children}
      </div>
    </div>
  );
}

function btn(bg: string): React.CSSProperties {
  return {
    padding: '0.4rem 0.9rem',
    background: bg,
    color: 'white',
    border: 0,
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: '0.85rem',
    fontWeight: 600,
  };
}
