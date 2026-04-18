'use client';

/**
 * NextActivityChip — next-activity suggestion (SCH-14).
 *
 * Calls schedule.suggestNextActivity({ enrollmentId }) and renders the
 * suggested lesson with human-readable reasoning, blocker warnings,
 * and a deep-link to schedule the lesson.
 */

import Link from 'next/link';
import { trpc } from '@/lib/trpc/client';

const H2: React.CSSProperties = {
  fontSize: '0.72rem',
  margin: '0 0 0.6rem',
  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
  color: '#7a869a',
  textTransform: 'uppercase',
  letterSpacing: '0.15em',
  fontWeight: 500,
};

export function NextActivityChip({
  enrollmentId,
  studentId,
}: {
  enrollmentId: string;
  studentId: string;
}) {
  const query = trpc.schedule.suggestNextActivity.useQuery({ enrollmentId });

  if (query.isLoading) {
    return (
      <section style={{ marginTop: '1.5rem' }}>
        <h2 style={H2}>Next activity</h2>
        <p style={{ color: '#5b6784', fontSize: '0.85rem', margin: 0 }}>Loading suggestion...</p>
      </section>
    );
  }

  const data = query.data;

  if (!data?.lessonId) {
    return (
      <section style={{ marginTop: '1.5rem' }}>
        <h2 style={H2}>Next activity</h2>
        <p style={{ color: '#7a869a', fontSize: '0.85rem', margin: 0 }}>
          {data?.reasoning ?? 'No activity available.'}
        </p>
      </section>
    );
  }

  const scheduleHref = `/schedule/request?studentId=${studentId}&lessonId=${data.lessonId}&enrollmentId=${enrollmentId}`;

  return (
    <section style={{ marginTop: '1.5rem' }}>
      <h2 style={H2}>Next activity</h2>
      <div
        style={{
          padding: '1rem 1.1rem',
          border: '1px solid #1f2940',
          borderRadius: 12,
          background: '#0d1220',
        }}
      >
        <div style={{ fontWeight: 600, fontSize: '0.95rem', color: '#f7f9fc' }}>
          Next: {data.reasoning}
        </div>

        {data.blockedBy ? (
          <div
            style={{
              marginTop: '0.6rem',
              padding: '0.5rem 0.7rem',
              background: 'rgba(251, 191, 36, 0.1)',
              border: '1px solid rgba(251, 191, 36, 0.3)',
              borderRadius: 6,
              fontSize: '0.82rem',
              color: '#fbbf24',
            }}
          >
            ⚠ Blocked: {data.blockedBy}
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
              fontSize: '0.72rem',
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              boxShadow:
                '0 4px 14px rgba(251, 191, 36, 0.2), 0 1px 0 rgba(255, 255, 255, 0.15) inset',
            }}
          >
            Schedule this lesson
          </Link>
        </div>
      </div>
    </section>
  );
}
