'use client';

/**
 * GrantOverrideDialog — override ceremony matching Phase 4 section 91.409 weight.
 *
 * Modal dialog for granting a management override on a lesson.
 * Requires justification (min 20 chars), expiration date, and signer confirmation.
 * Language: "Authorize" / "chief instructor granted" — NEVER "approved".
 */

import { useState, useEffect } from 'react';
import { trpc } from '@/lib/trpc/client';
import type { Blocker, LessonOverrideKind } from '@part61/domain';

function deriveDefaultKind(blockers: Blocker[]): LessonOverrideKind {
  for (const b of blockers) {
    if (b.kind === 'prerequisites') return 'prerequisite_skip';
    if (b.kind === 'repeat_limit') return 'repeat_limit_exceeded';
    if (b.kind === 'student_qualifications' || b.kind === 'instructor_qualifications') {
      return 'currency_waiver';
    }
  }
  return 'prerequisite_skip';
}

function defaultExpiry(): string {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().slice(0, 10);
}

const KIND_OPTIONS: Array<{ value: LessonOverrideKind; label: string }> = [
  { value: 'prerequisite_skip', label: 'Prerequisite skip' },
  { value: 'repeat_limit_exceeded', label: 'Repeat limit exceeded' },
  { value: 'currency_waiver', label: 'Currency waiver' },
];

const LABEL: React.CSSProperties = {
  fontSize: '0.7rem',
  fontWeight: 600,
  marginBottom: '0.35rem',
  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: '#7a869a',
};

const INPUT: React.CSSProperties = {
  width: '100%',
  padding: '0.5rem 0.65rem',
  background: '#0a0f1d',
  border: '1px solid #1f2940',
  borderRadius: 6,
  color: '#f7f9fc',
  fontSize: '0.85rem',
  fontFamily: 'inherit',
};

export function GrantOverrideDialog({
  open,
  onOpenChange,
  enrollmentId,
  lessonId,
  blockers,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  enrollmentId: string;
  lessonId: string;
  blockers: Blocker[];
}) {
  const [kind, setKind] = useState<LessonOverrideKind>(() => deriveDefaultKind(blockers));
  const [justification, setJustification] = useState('');
  const [expiresAt, setExpiresAt] = useState(defaultExpiry);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const grantMut = trpc.admin.overrides.grant.useMutation();

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setKind(deriveDefaultKind(blockers));
      setJustification('');
      setExpiresAt(defaultExpiry());
      setConfirmed(false);
      setError(null);
    }
  }, [open, blockers]);

  if (!open) return null;

  const justificationValid = justification.trim().length >= 20;
  const canSubmit = justificationValid && confirmed && !grantMut.isPending;

  async function handleSubmit() {
    setError(null);
    try {
      await grantMut.mutateAsync({
        enrollmentId,
        lessonId,
        kind,
        justification: justification.trim(),
        expiresAt: new Date(expiresAt),
      });
      // Invalidate eligibility query so blocker list refreshes
      void utils.schedule.evaluateLessonEligibility.invalidate();
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to grant override');
    }
  }

  const amber = '#fbbf24';

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(3, 6, 15, 0.78)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
        backdropFilter: 'blur(4px)',
      }}
    >
      <div
        style={{
          background: '#0d1220',
          padding: '1.5rem',
          borderRadius: 12,
          maxWidth: 540,
          width: '100%',
          border: `1px solid ${amber}55`,
          boxShadow: '0 24px 64px rgba(0,0,0,0.55)',
          color: '#cbd5e1',
        }}
      >
        <div
          style={{
            fontFamily: '"JetBrains Mono", ui-monospace, monospace',
            fontSize: '0.68rem',
            letterSpacing: '0.25em',
            textTransform: 'uppercase',
            color: amber,
            marginBottom: '0.35rem',
          }}
        >
          Chief instructor override
        </div>
        <h2
          style={{
            margin: '0 0 0.35rem',
            color: '#f7f9fc',
            fontFamily: '"Antonio", system-ui, sans-serif',
            fontSize: '1.35rem',
            fontWeight: 600,
            letterSpacing: '-0.01em',
          }}
        >
          Authorize out-of-sequence lesson
        </h2>
        <p style={{ fontSize: '0.85rem', color: '#7a869a', margin: '0 0 1rem' }}>
          This override is legally significant. A record of this authorization will be permanently
          attached to the student&apos;s training record.
        </p>

        {error ? (
          <p style={{ color: '#f87171', fontSize: '0.85rem', margin: '0 0 0.75rem' }}>{error}</p>
        ) : null}

        <label style={{ display: 'block', marginBottom: '0.85rem' }}>
          <div style={LABEL}>Override kind</div>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as LessonOverrideKind)}
            style={INPUT}
          >
            {KIND_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: 'block', marginBottom: '0.85rem' }}>
          <div
            style={{
              ...LABEL,
              display: 'flex',
              justifyContent: 'space-between',
              marginBottom: '0.35rem',
            }}
          >
            <span>Justification</span>
            <span
              style={{
                color: justificationValid ? '#34d399' : '#f87171',
                fontSize: '0.68rem',
              }}
            >
              {justification.trim().length} / 20 min
            </span>
          </div>
          <textarea
            rows={3}
            value={justification}
            onChange={(e) => setJustification(e.target.value)}
            placeholder="Describe the circumstances requiring this override (minimum 20 characters)"
            style={{ ...INPUT, resize: 'vertical' }}
          />
        </label>

        <label style={{ display: 'block', marginBottom: '0.85rem' }}>
          <div style={LABEL}>Expires at</div>
          <input
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            style={{ ...INPUT, width: 'auto' }}
          />
        </label>

        <div
          style={{
            padding: '0.8rem',
            background: 'rgba(251, 191, 36, 0.08)',
            border: `1px solid ${amber}44`,
            borderRadius: 8,
            marginBottom: '0.9rem',
          }}
        >
          <label
            style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', cursor: 'pointer' }}
          >
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              style={{ marginTop: '0.2rem' }}
            />
            <span style={{ fontSize: '0.85rem', color: '#cbd5e1' }}>
              I confirm I am authorized to grant this override as a chief instructor or admin. This
              authorization will be permanently recorded with my identity.
            </span>
          </label>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            style={{
              padding: '0.45rem 0.9rem',
              border: '1px solid #1f2940',
              borderRadius: 6,
              background: '#0d1220',
              color: '#cbd5e1',
              cursor: 'pointer',
              fontSize: '0.72rem',
              fontFamily: '"JetBrains Mono", ui-monospace, monospace',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              fontWeight: 600,
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => void handleSubmit()}
            style={{
              padding: '0.45rem 0.95rem',
              border: 'none',
              borderRadius: 6,
              background: canSubmit
                ? 'linear-gradient(180deg, #fbbf24 0%, #f59e0b 100%)'
                : '#293352',
              color: canSubmit ? '#0a0e1a' : '#5b6784',
              cursor: canSubmit ? 'pointer' : 'not-allowed',
              fontWeight: 700,
              fontSize: '0.72rem',
              fontFamily: '"JetBrains Mono", ui-monospace, monospace',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              boxShadow: canSubmit
                ? '0 4px 14px rgba(251, 191, 36, 0.25), 0 1px 0 rgba(255, 255, 255, 0.15) inset'
                : 'none',
            }}
          >
            {grantMut.isPending ? 'Authorizing...' : 'Authorize override'}
          </button>
        </div>
      </div>
    </div>
  );
}
