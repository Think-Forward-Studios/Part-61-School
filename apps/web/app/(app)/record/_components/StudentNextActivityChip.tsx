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

export function StudentNextActivityChip({ enrollmentId }: { enrollmentId: string }) {
  const query = trpc.schedule.suggestNextActivity.useQuery({ enrollmentId });

  if (query.isLoading) {
    return (
      <section style={{ marginTop: '1rem' }}>
        <h2 style={{ fontSize: '1rem' }}>What to work on next</h2>
        <p style={{ color: '#888' }}>Loading suggestion...</p>
      </section>
    );
  }

  const data = query.data;

  if (!data?.lessonId) {
    return (
      <section style={{ marginTop: '1rem' }}>
        <h2 style={{ fontSize: '1rem' }}>What to work on next</h2>
        <p style={{ color: '#888' }}>
          {data?.reasoning ?? 'No suggested activity right now. You may be all caught up!'}
        </p>
      </section>
    );
  }

  const scheduleHref = `/schedule/request?lessonId=${data.lessonId}&enrollmentId=${enrollmentId}`;

  return (
    <section style={{ marginTop: '1rem' }}>
      <h2 style={{ fontSize: '1rem' }}>What to work on next</h2>
      <div
        style={{
          padding: '0.75rem',
          border: '1px solid #e5e7eb',
          borderRadius: 6,
          background: '#fafafa',
        }}
      >
        <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>
          Up next: {data.reasoning}
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
            Heads up: {data.blockedBy}
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
            Request this lesson
          </Link>
        </div>
      </div>
    </section>
  );
}
