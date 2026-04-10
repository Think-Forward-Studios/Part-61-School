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

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
      }}
    >
      <div
        style={{
          background: 'white',
          padding: '1.5rem',
          borderRadius: 8,
          maxWidth: 520,
          width: '100%',
          border: '2px solid #b45309',
        }}
      >
        <h2 style={{ margin: '0 0 0.25rem', color: '#b45309' }}>
          Authorize out-of-sequence lesson
        </h2>
        <p style={{ fontSize: '0.85rem', color: '#6b7280', margin: '0 0 1rem' }}>
          This override is legally significant. A record of this authorization will be
          permanently attached to the student&apos;s training record.
        </p>

        {error ? (
          <p style={{ color: 'crimson', fontSize: '0.85rem', margin: '0 0 0.75rem' }}>{error}</p>
        ) : null}

        <label style={{ display: 'block', marginBottom: '0.75rem' }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>
            Override kind
          </div>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as LessonOverrideKind)}
            style={{ width: '100%', padding: '0.4rem' }}
          >
            {KIND_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: 'block', marginBottom: '0.75rem' }}>
          <div
            style={{
              fontSize: '0.85rem',
              fontWeight: 600,
              marginBottom: '0.25rem',
              display: 'flex',
              justifyContent: 'space-between',
            }}
          >
            <span>Justification</span>
            <span
              style={{
                fontWeight: 400,
                color: justificationValid ? '#16a34a' : '#dc2626',
                fontSize: '0.8rem',
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
            style={{ width: '100%', padding: '0.5rem' }}
          />
        </label>

        <label style={{ display: 'block', marginBottom: '0.75rem' }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>
            Expires at
          </div>
          <input
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            style={{ padding: '0.4rem' }}
          />
        </label>

        <div
          style={{
            padding: '0.75rem',
            background: '#fefce8',
            border: '1px solid #fde68a',
            borderRadius: 4,
            marginBottom: '0.75rem',
          }}
        >
          <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              style={{ marginTop: '0.2rem' }}
            />
            <span style={{ fontSize: '0.85rem' }}>
              I confirm I am authorized to grant this override as a chief instructor or admin.
              This authorization will be permanently recorded with my identity.
            </span>
          </label>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            style={{
              padding: '0.4rem 0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: 4,
              background: 'white',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => void handleSubmit()}
            style={{
              padding: '0.4rem 0.75rem',
              border: 'none',
              borderRadius: 4,
              background: canSubmit ? '#b45309' : '#d1d5db',
              color: 'white',
              cursor: canSubmit ? 'pointer' : 'not-allowed',
              fontWeight: 600,
            }}
          >
            {grantMut.isPending ? 'Authorizing...' : 'Authorize override'}
          </button>
        </div>
      </div>
    </div>
  );
}
