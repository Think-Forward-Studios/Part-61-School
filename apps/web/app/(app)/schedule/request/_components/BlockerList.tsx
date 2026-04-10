'use client';

/**
 * BlockerList — inline blocker display for /schedule/request (SCH-05/11, SYL-19).
 *
 * Renders each blocker as a row with icon, message, and optional fix link.
 * If canGrantOverride is true, shows a prominent "Authorize out-of-sequence lesson" button.
 */

import type { Blocker } from '@part61/domain';

function renderBlockerMessage(blocker: Blocker): string {
  switch (blocker.kind) {
    case 'prerequisites':
      return `Prerequisite lesson(s) not complete: ${blocker.detail.missing_lessons.length} outstanding`;
    case 'student_qualifications': {
      const parts: string[] = [];
      if (blocker.detail.missing_currencies.length > 0) {
        parts.push(`missing currency: ${blocker.detail.missing_currencies.join(', ')}`);
      }
      if (blocker.detail.missing_qualifications.length > 0) {
        parts.push(`missing qualification: ${blocker.detail.missing_qualifications.join(', ')}`);
      }
      return `Student qualification issue: ${parts.join('; ')}`;
    }
    case 'instructor_qualifications': {
      const parts: string[] = [];
      if (blocker.detail.missing_currencies.length > 0) {
        parts.push(`missing currency: ${blocker.detail.missing_currencies.join(', ')}`);
      }
      if (blocker.detail.missing_qualifications.length > 0) {
        parts.push(`missing qualification: ${blocker.detail.missing_qualifications.join(', ')}`);
      }
      return `Instructor qualification issue: ${parts.join('; ')}`;
    }
    case 'resource': {
      const parts: string[] = [];
      if (blocker.detail.missing_tags.length > 0) {
        parts.push(`missing equipment: ${blocker.detail.missing_tags.join(', ')}`);
      }
      if (blocker.detail.missing_type) {
        parts.push(`aircraft type mismatch: requires ${blocker.detail.missing_type}`);
      }
      if (blocker.detail.missing_sim_kind) {
        parts.push(`simulator kind mismatch: requires ${blocker.detail.missing_sim_kind}`);
      }
      return `Aircraft/resource issue: ${parts.join('; ')}`;
    }
    case 'repeat_limit':
      return `Repeat limit reached: ${blocker.detail.current_count} of ${blocker.detail.max} attempts used`;
  }
}

function blockerFixHint(
  blocker: Blocker,
  studentId?: string,
): { label: string; href: string } | null {
  if (blocker.kind === 'student_qualifications' && studentId) {
    return {
      label: 'Update student currencies',
      href: `/admin/people/${studentId}#currencies`,
    };
  }
  return null;
}

export function BlockerList({
  blockers,
  canGrantOverride,
  onGrantClick,
  studentId,
}: {
  blockers: Blocker[];
  canGrantOverride: boolean;
  onGrantClick: () => void;
  studentId?: string;
}) {
  if (blockers.length === 0) return null;

  return (
    <div
      style={{
        border: '1px solid #fde68a',
        borderRadius: 6,
        padding: '0.75rem',
        background: '#fffbeb',
        marginTop: '0.75rem',
      }}
    >
      <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.5rem', color: '#92400e' }}>
        Eligibility blockers
      </div>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: '0.85rem' }}>
        {blockers.map((b, i) => {
          const fix = blockerFixHint(b, studentId);
          return (
            <li
              key={`${b.kind}-${i}`}
              style={{
                padding: '0.35rem 0',
                borderBottom: i < blockers.length - 1 ? '1px solid #fde68a' : undefined,
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.5rem',
              }}
            >
              <span style={{ flexShrink: 0 }}>&#9888;</span>
              <div>
                <div>{renderBlockerMessage(b)}</div>
                {fix ? (
                  <a
                    href={fix.href}
                    style={{ fontSize: '0.8rem', color: '#2563eb', textDecoration: 'underline' }}
                  >
                    {fix.label}
                  </a>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      {canGrantOverride ? (
        <button
          type="button"
          onClick={onGrantClick}
          style={{
            marginTop: '0.75rem',
            padding: '0.4rem 0.75rem',
            background: '#b45309',
            color: 'white',
            border: 'none',
            borderRadius: 4,
            fontWeight: 600,
            fontSize: '0.85rem',
            cursor: 'pointer',
          }}
        >
          Authorize out-of-sequence lesson
        </button>
      ) : null}
    </div>
  );
}
