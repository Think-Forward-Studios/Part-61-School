/**
 * /profile/notifications — Phase 8 (08-02, NOT-02).
 *
 * Per-event × per-channel toggle matrix. Rows are grouped notification
 * kinds (Reservations / Grading / Squawks / Documents & Currency /
 * Messaging / Safety) and columns are (in_app, email). Safety-critical
 * in_app cells are disabled (always delivered).
 */
import { NotificationPrefsMatrix } from './NotificationPrefsMatrix';
import { PageHeader } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default function NotificationPrefsPage() {
  return (
    <main style={{ padding: '0 1.5rem 2rem', maxWidth: 1200, margin: '0 auto' }}>
      <PageHeader
        eyebrow="Account"
        title="Notifications"
        subtitle="Choose which alerts reach you and how."
      />
      {/* Behaviour callout — easier to spot than the old one-liner
          subtitle. Two specific rules a user is liable to misread:
            1. Safety events are forced ON for in-app (the tickbox is
               locked checked).
            2. Email respects the user toggle for EVERY event, safety
               or not — there is no force-email path. */}
      <section
        style={{
          background: 'rgba(251, 191, 36, 0.08)',
          border: '1px solid rgba(251, 191, 36, 0.35)',
          borderRadius: 12,
          padding: '0.9rem 1.1rem',
          marginTop: '0.5rem',
          marginBottom: '1.5rem',
          display: 'flex',
          gap: '0.85rem',
          alignItems: 'flex-start',
        }}
      >
        <span
          aria-hidden
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 28,
            height: 28,
            flexShrink: 0,
            background: 'rgba(251, 191, 36, 0.18)',
            color: '#fbbf24',
            border: '1px solid rgba(251, 191, 36, 0.4)',
            borderRadius: 999,
            fontFamily: '"JetBrains Mono", ui-monospace, monospace',
            fontWeight: 700,
            fontSize: '0.78rem',
          }}
        >
          ⚠
        </span>
        <div style={{ color: '#fde68a', fontSize: '0.88rem', lineHeight: 1.55 }}>
          <strong style={{ color: '#fbbf24' }}>How safety events behave:</strong> Events flagged{' '}
          <span
            style={{
              padding: '0.05rem 0.4rem',
              borderRadius: 999,
              background: 'rgba(248, 113, 113, 0.18)',
              color: '#fca5a5',
              border: '1px solid rgba(248, 113, 113, 0.4)',
              fontSize: '0.68rem',
              fontFamily: '"JetBrains Mono", ui-monospace, monospace',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              fontWeight: 700,
            }}
          >
            Safety
          </span>{' '}
          always deliver <strong style={{ color: '#fde68a' }}>in-app</strong> — the in-app tickbox
          is locked on and can&apos;t be cleared.{' '}
          <strong style={{ color: '#fde68a' }}>Email is different:</strong> it follows your choice
          for every event, safety or not. If you uncheck email on a safety event, the email will not
          be sent — you&apos;ll still get the in-app alert.
        </div>
      </section>
      <NotificationPrefsMatrix />
    </main>
  );
}
