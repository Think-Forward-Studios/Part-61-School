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
  const purge = trpc.admin.people.purge.useMutation();

  // Purge confirmation flow: admin has to type the email to arm the
  // button. Mirrors GitHub / Linear / etc. Prevents clicking "Purge"
  // with fat fingers on the wrong tab.
  const [purgeOpen, setPurgeOpen] = useState(false);
  const [purgeConfirmText, setPurgeConfirmText] = useState('');

  async function run(
    key: 'invite' | 'reset' | 'toggle' | 'purge',
    fn: () => Promise<unknown>,
    successMsg: string,
    onSuccess?: () => void,
  ) {
    setPending(key);
    setMessage(null);
    try {
      await fn();
      setMessage({ kind: 'ok', text: successMsg });
      onSuccess?.();
      router.refresh();
    } catch (err) {
      setMessage({
        kind: 'err',
        text: err instanceof Error ? err.message : 'Action failed',
      });
    } finally {
      setPending(null);
      // Keep purge errors visible longer — the message is long.
      setTimeout(() => setMessage(null), key === 'purge' ? 12000 : 6000);
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

      {/* Danger zone — purge. Separated visually so it's not lumped in
          with the routine rescue actions. Only succeeds when the user
          has zero downstream history (no flight logs / training
          records / audit trail). Requires typing the email to arm. */}
      <div
        style={{
          marginTop: '1.1rem',
          paddingTop: '0.9rem',
          borderTop: '1px dashed rgba(248, 113, 113, 0.25)',
        }}
      >
        {!purgeOpen ? (
          <button
            type="button"
            onClick={() => setPurgeOpen(true)}
            style={{
              ...buttonStyle,
              borderColor: 'rgba(248, 113, 113, 0.5)',
              color: '#fca5a5',
              background: 'rgba(127, 29, 29, 0.15)',
            }}
          >
            Purge account (hard delete)
          </button>
        ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.55rem',
              padding: '0.9rem 1rem',
              background: 'rgba(127, 29, 29, 0.15)',
              border: '1px solid rgba(248, 113, 113, 0.4)',
              borderRadius: 10,
            }}
          >
            <div style={{ color: '#fca5a5', fontWeight: 600, fontSize: '0.85rem' }}>
              Hard delete — this can&apos;t be undone.
            </div>
            <div style={{ color: '#fecaca', fontSize: '0.78rem', lineHeight: 1.5 }}>
              Fully removes the account and every record tied to it: flight logs, reservations,
              training records, currencies, qualifications, holds, emergency contacts, documents,
              notifications — all gone. The email address frees up for re-use. This bypasses the
              usual soft-delete / FAA-audit retention — the operator accepts responsibility.
              <br />
              Type <code style={{ color: '#fff' }}>{email}</code> below to confirm.
            </div>
            <input
              type="text"
              value={purgeConfirmText}
              onChange={(e) => setPurgeConfirmText(e.target.value)}
              placeholder={email}
              autoComplete="off"
              style={{
                height: '2.3rem',
                background: 'rgba(9, 13, 24, 0.85)',
                border: '1px solid rgba(255,255,255,0.14)',
                borderRadius: 8,
                color: '#e2e8f0',
                padding: '0 0.75rem',
                fontSize: '0.88rem',
                outline: 'none',
              }}
            />
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                disabled={pending !== null || purgeConfirmText.trim() !== email}
                onClick={() =>
                  run(
                    'purge',
                    () => purge.mutateAsync({ userId }),
                    `${email} has been purged.`,
                    () => {
                      // Bounce back to the list — this user's detail
                      // page no longer exists.
                      router.push('/admin/people');
                    },
                  )
                }
                style={{
                  ...buttonStyle,
                  borderColor: 'rgba(248, 113, 113, 0.5)',
                  color: purgeConfirmText.trim() === email ? '#fca5a5' : 'rgba(252,165,165,0.4)',
                  background: 'rgba(127, 29, 29, 0.25)',
                  cursor: purgeConfirmText.trim() === email ? 'pointer' : 'not-allowed',
                }}
              >
                {pending === 'purge' ? 'Purging…' : 'Purge permanently'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setPurgeOpen(false);
                  setPurgeConfirmText('');
                }}
                style={buttonStyle}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
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
