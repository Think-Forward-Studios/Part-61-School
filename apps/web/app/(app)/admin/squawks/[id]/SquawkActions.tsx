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

const MONO: React.CSSProperties = {
  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
};

type Tone = 'mint' | 'sky' | 'amber' | 'rose' | 'dim';

const TONE: Record<Tone, { bg: string; fg: string; border: string }> = {
  mint: {
    bg: 'rgba(52, 211, 153, 0.12)',
    fg: '#34d399',
    border: 'rgba(52, 211, 153, 0.35)',
  },
  sky: {
    bg: 'rgba(56, 189, 248, 0.12)',
    fg: '#38bdf8',
    border: 'rgba(56, 189, 248, 0.35)',
  },
  amber: {
    bg: 'rgba(251, 191, 36, 0.12)',
    fg: '#fbbf24',
    border: 'rgba(251, 191, 36, 0.4)',
  },
  rose: {
    bg: 'rgba(248, 113, 113, 0.14)',
    fg: '#f87171',
    border: 'rgba(248, 113, 113, 0.4)',
  },
  dim: {
    bg: 'transparent',
    fg: '#cbd5e1',
    border: '#293352',
  },
};

function btn(tone: Tone, extra: React.CSSProperties = {}): React.CSSProperties {
  const t = TONE[tone];
  return {
    padding: '0.4rem 0.9rem',
    background: t.bg,
    color: t.fg,
    border: `1px solid ${t.border}`,
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: '0.72rem',
    fontWeight: 600,
    ...MONO,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    ...extra,
  };
}

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

  async function doMove(fn: () => Promise<unknown>, msg: string): Promise<void> {
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
    const deferralJustification = (fd.get('deferralJustification') as string) || undefined;
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
    await doMove(() => rts.mutateAsync({ squawkId }), 'Return-to-service failed');
    setRtsOpen(false);
  }

  async function submitCancel() {
    const reason = prompt('Cancel reason?') ?? '';
    if (!reason.trim()) return;
    await doMove(() => cancel.mutateAsync({ squawkId, reason: reason.trim() }), 'Cancel failed');
  }

  if (status === 'returned_to_service' || status === 'cancelled') {
    return (
      <p style={{ marginTop: '1rem', color: '#7a869a', fontSize: '0.85rem' }}>
        Squawk is closed ({status.replace('_', ' ')}). No further actions.
      </p>
    );
  }

  return (
    <section
      style={{
        marginTop: '1rem',
        padding: '1rem 1.25rem',
        background: '#0d1220',
        border: '1px solid #1f2940',
        borderRadius: 12,
      }}
    >
      <h2 style={{ margin: '0 0 0.5rem 0', fontSize: '0.95rem', color: '#f7f9fc' }}>Actions</h2>
      {!isMechanic ? (
        <p style={{ color: '#fbbf24', fontSize: '0.85rem' }}>
          You need mechanic authority (A&amp;P or IA) to sign squawk transitions.
        </p>
      ) : null}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        {status === 'open' && isMechanic ? (
          <button type="button" onClick={() => setTriageOpen(true)} style={btn('amber')}>
            Triage
          </button>
        ) : null}
        {(status === 'triaged' || status === 'deferred') && isMechanic ? (
          <button
            type="button"
            onClick={() =>
              doMove(() => moveToInWork.mutateAsync({ squawkId }), 'Move to in-work failed')
            }
            style={btn('sky')}
          >
            Start work
          </button>
        ) : null}
        {status === 'in_work' && isMechanic ? (
          <button
            type="button"
            onClick={() => doMove(() => markFixed.mutateAsync({ squawkId }), 'Mark fixed failed')}
            style={btn('mint')}
          >
            Mark fixed
          </button>
        ) : null}
        {status === 'fixed' && isMechanic ? (
          <button
            type="button"
            onClick={() => setRtsOpen(true)}
            style={btn('rose', { padding: '0.5rem 1.1rem', fontSize: '0.78rem' })}
          >
            Sign and Return to Service
          </button>
        ) : null}
        <button type="button" onClick={submitCancel} style={btn('dim')}>
          Cancel
        </button>
      </div>
      {error ? (
        <p style={{ color: '#f87171', fontSize: '0.85rem', marginTop: '0.5rem' }}>{error}</p>
      ) : null}

      {triageOpen ? (
        <Modal onClose={() => setTriageOpen(false)}>
          <form onSubmit={submitTriage}>
            <h3 style={{ margin: 0, color: '#f7f9fc' }}>Triage squawk</h3>
            <label
              style={{
                display: 'block',
                marginTop: '0.5rem',
                fontSize: '0.8rem',
                color: '#7a869a',
              }}
            >
              Action
              <select name="action" defaultValue="in_work" style={{ width: '100%' }}>
                <option value="in_work">Start work immediately</option>
                <option value="defer">Defer (MEL)</option>
              </select>
            </label>
            <label
              style={{
                display: 'block',
                marginTop: '0.5rem',
                fontSize: '0.8rem',
                color: '#7a869a',
              }}
            >
              Deferred until (optional)
              <input name="deferredUntil" type="date" style={{ width: '100%' }} />
            </label>
            <label
              style={{
                display: 'block',
                marginTop: '0.5rem',
                fontSize: '0.8rem',
                color: '#7a869a',
              }}
            >
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
              <button type="button" onClick={() => setTriageOpen(false)} style={btn('dim')}>
                Cancel
              </button>
              <button type="submit" style={btn('amber')}>
                Triage
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {rtsOpen ? (
        <Modal onClose={() => setRtsOpen(false)}>
          <div>
            <h3 style={{ margin: 0, color: '#f87171' }}>Sign and Return to Service</h3>
            <p
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
              This is legally binding. Your mechanic certificate will be captured in an immutable
              snapshot and the aircraft may be cleared to fly when all other grounding causes are
              resolved.
            </p>
            <div
              style={{
                display: 'flex',
                gap: '0.5rem',
                justifyContent: 'flex-end',
                marginTop: '1rem',
              }}
            >
              <button type="button" onClick={() => setRtsOpen(false)} style={btn('dim')}>
                Cancel
              </button>
              <button
                type="button"
                onClick={submitRts}
                disabled={rts.isPending}
                style={btn('rose', {
                  padding: '0.5rem 1.1rem',
                  fontSize: '0.78rem',
                  cursor: rts.isPending ? 'wait' : 'pointer',
                  opacity: rts.isPending ? 0.6 : 1,
                })}
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

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      onClick={onClose}
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
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#0d1220',
          padding: '1.25rem',
          borderRadius: 12,
          maxWidth: 520,
          width: '90%',
          border: '1px solid #1f2940',
          color: '#cbd5e1',
        }}
      >
        {children}
      </div>
    </div>
  );
}
