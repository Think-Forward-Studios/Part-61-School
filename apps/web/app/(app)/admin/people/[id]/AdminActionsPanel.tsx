'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';

interface AdminActionsPanelProps {
  userId: string;
  email: string;
  status: 'pending' | 'active' | 'inactive' | 'rejected';
}

/**
 * Rescue actions for admins to manage a user account when something
 * has gone sideways — invite link dead, forgotten password, account
 * needs to be frozen without deleting, etc. All three actions are
 * adminProcedure-gated on the server and scoped to the current tenant.
 *
 *   - Resend invite : re-fire Supabase inviteUserByEmail with a fresh
 *     token and the correct redirect. Use this for users who got a
 *     broken link (e.g. localhost during the early deploy) or never
 *     received the first email.
 *   - Send password reset : emails a magic-link recovery URL via
 *     Supabase auth. Works for any user that already has an auth.users
 *     row (i.e. any user who accepted an invite).
 *   - Set active / inactive : flips users.status. Inactive users
 *     retain history but can't log in or be assigned new work.
 */
export function AdminActionsPanel({ userId, email, status }: AdminActionsPanelProps) {
  const router = useRouter();
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  const resendInvite = trpc.admin.people.resendInvite.useMutation();
  const sendReset = trpc.admin.people.sendPasswordReset.useMutation();
  const setStatus = trpc.admin.people.setStatus.useMutation();

  async function run(
    key: 'invite' | 'reset' | 'toggle',
    fn: () => Promise<unknown>,
    successMsg: string,
  ) {
    setPending(key);
    setMessage(null);
    try {
      await fn();
      setMessage({ kind: 'ok', text: successMsg });
      router.refresh();
    } catch (err) {
      setMessage({
        kind: 'err',
        text: err instanceof Error ? err.message : 'Action failed',
      });
    } finally {
      setPending(null);
      setTimeout(() => setMessage(null), 6000);
    }
  }

  const isInactive = status === 'inactive';
  const statusToToggle: 'active' | 'inactive' = isInactive ? 'active' : 'inactive';

  return (
    <section
      style={{
        marginTop: '1.5rem',
        padding: '1.1rem 1.25rem',
        background: 'rgba(18, 24, 38, 0.6)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 12,
      }}
    >
      <header style={{ marginBottom: '0.85rem' }}>
        <h2
          style={{
            margin: 0,
            fontSize: '0.72rem',
            fontFamily: '"JetBrains Mono", ui-monospace, monospace',
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: '#7a869a',
            fontWeight: 600,
          }}
        >
          Admin actions
        </h2>
        <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', color: '#94a3b8' }}>
          Rescue actions for this account. <span style={{ color: '#cbd5e1' }}>{email}</span> ·
          current status: <span style={{ color: '#f7f9fc' }}>{status}</span>
        </p>
      </header>

      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
        <button
          type="button"
          disabled={pending !== null}
          onClick={() =>
            run(
              'invite',
              () => resendInvite.mutateAsync({ userId }),
              `Invite email re-sent to ${email}.`,
            )
          }
          style={buttonStyle}
        >
          {pending === 'invite' ? 'Sending…' : 'Re-send invite email'}
        </button>

        <button
          type="button"
          disabled={pending !== null}
          onClick={() =>
            run(
              'reset',
              () => sendReset.mutateAsync({ userId }),
              `Password-reset email sent to ${email}.`,
            )
          }
          style={buttonStyle}
        >
          {pending === 'reset' ? 'Sending…' : 'Send password reset'}
        </button>

        <button
          type="button"
          disabled={pending !== null}
          onClick={() =>
            run(
              'toggle',
              () => setStatus.mutateAsync({ userId, status: statusToToggle }),
              isInactive ? 'Account reactivated.' : 'Account marked inactive.',
            )
          }
          style={{
            ...buttonStyle,
            borderColor: isInactive ? 'rgba(74, 222, 128, 0.4)' : 'rgba(248, 113, 113, 0.4)',
            color: isInactive ? '#4ade80' : '#fca5a5',
          }}
        >
          {pending === 'toggle' ? 'Saving…' : isInactive ? 'Reactivate account' : 'Mark inactive'}
        </button>
      </div>

      {message ? (
        <div
          style={{
            marginTop: '0.75rem',
            fontSize: '0.82rem',
            color: message.kind === 'ok' ? '#4ade80' : '#f87171',
          }}
        >
          {message.text}
        </div>
      ) : null}
    </section>
  );
}

const buttonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  height: '2.3rem',
  padding: '0 0.95rem',
  background: 'rgba(9, 13, 24, 0.85)',
  border: '1px solid rgba(255,255,255,0.14)',
  borderRadius: 8,
  color: '#e2e8f0',
  fontSize: '0.84rem',
  fontWeight: 600,
  cursor: 'pointer',
};
