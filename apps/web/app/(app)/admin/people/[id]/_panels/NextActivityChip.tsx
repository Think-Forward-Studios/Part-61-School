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
        <h2 style={{ fontSize: '1rem' }}>Next activity</h2>
        <p style={{ color: '#888' }}>Loading suggestion...</p>
      </section>
    );
  }

  const data = query.data;

  if (!data?.lessonId) {
    return (
      <section style={{ marginTop: '1.5rem' }}>
        <h2 style={{ fontSize: '1rem' }}>Next activity</h2>
        <p style={{ color: '#888' }}>{data?.reasoning ?? 'No activity available.'}</p>
      </section>
    );
  }

  const scheduleHref = `/schedule/request?studentId=${studentId}&lessonId=${data.lessonId}&enrollmentId=${enrollmentId}`;

  return (
    <section style={{ marginTop: '1.5rem' }}>
      <h2 style={{ fontSize: '1rem' }}>Next activity</h2>
      <div
        style={{
          padding: '0.75rem',
          border: '1px solid #e5e7eb',
          borderRadius: 6,
          background: '#fafafa',
        }}
      >
        <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>
          Next: {data.reasoning}
        </div>

        {data.blockedBy ? (
          <div
            style={{
              marginTop: '0.5rem',
              padding: '0.4rem 0.6rem',
              background: '#fef3c7',
              border: '1px solid #fde68a',
              borderRadius: 4,
              fontSize: '0.85rem',
              color: '#92400e',
            }}
          >
            Blocked: {data.blockedBy}
          </div>
        ) : null}

        <div style={{ marginTop: '0.5rem' }}>
          <Link
            href={scheduleHref}
            style={{
              display: 'inline-block',
              padding: '0.35rem 0.75rem',
              background: '#2563eb',
              color: 'white',
              borderRadius: 4,
              textDecoration: 'none',
              fontSize: '0.85rem',
              fontWeight: 500,
            }}
          >
            Schedule this lesson
          </Link>
        </div>
      </div>
    </section>
  );
}
