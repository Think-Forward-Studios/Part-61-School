'use client';

/**
 * StudentNextActivityChip — next-activity suggestion for students (SCH-14).
 *
 * Calls schedule.suggestNextActivity({ enrollmentId }) and renders the
 * suggested lesson with human-readable reasoning. Unlike the admin
 * NextActivityChip, this omits the studentId param (server-scoped to
 * the logged-in student) and uses encouragement-first language.
 */

import Link from 'next/link';
import { trpc } from '@/lib/trpc/client';

const SECTION_HEADING: React.CSSProperties = {
  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
  fontSize: '0.72rem',
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  color: '#7a869a',
  marginBottom: '0.5rem',
  fontWeight: 500,
};

export function StudentNextActivityChip({ enrollmentId }: { enrollmentId: string }) {
  const query = trpc.schedule.suggestNextActivity.useQuery({ enrollmentId });

  if (query.isLoading) {
    return (
      <section style={{ marginTop: '1rem' }}>
        <h2 style={SECTION_HEADING}>What to work on next</h2>
        <p style={{ color: '#5b6784' }}>Loading suggestion...</p>
      </section>
    );
  }

  const data = query.data;

  if (!data?.lessonId) {
    return (
      <section style={{ marginTop: '1rem' }}>
        <h2 style={SECTION_HEADING}>What to work on next</h2>
        <p style={{ color: '#7a869a' }}>
          {data?.reasoning ?? 'No suggested activity right now. You may be all caught up!'}
        </p>
      </section>
    );
  }

  const scheduleHref = `/schedule/request?lessonId=${data.lessonId}&enrollmentId=${enrollmentId}`;

  return (
    <section style={{ marginTop: '1rem' }}>
      <h2 style={SECTION_HEADING}>What to work on next</h2>
      <div
        style={{
          padding: '0.9rem 1rem',
          border: '1px solid #1f2940',
          borderRadius: 12,
          background: '#0d1220',
        }}
      >
        <div style={{ fontWeight: 600, fontSize: '0.95rem', color: '#f7f9fc' }}>
          Up next: {data.reasoning}
        </div>

        {data.blockedBy ? (
          <div
            style={{
              marginTop: '0.6rem',
              padding: '0.5rem 0.7rem',
              background: 'rgba(251, 191, 36, 0.1)',
              border: '1px solid rgba(251, 191, 36, 0.35)',
              borderRadius: 6,
              fontSize: '0.85rem',
              color: '#fbbf24',
            }}
          >
            Heads up: {data.blockedBy}
          </div>
        ) : null}

        <div style={{ marginTop: '0.75rem' }}>
          <Link
            href={scheduleHref}
            style={{
              display: 'inline-block',
              padding: '0.45rem 0.9rem',
              background: 'linear-gradient(180deg, #fbbf24 0%, #f59e0b 100%)',
              color: '#0a0e1a',
              borderRadius: 8,
              textDecoration: 'none',
              fontSize: '0.75rem',
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              boxShadow:
                '0 4px 14px rgba(251, 191, 36, 0.25), 0 1px 0 rgba(255, 255, 255, 0.15) inset',
            }}
          >
            Request this lesson
          </Link>
        </div>
      </div>
    </section>
  );
}
