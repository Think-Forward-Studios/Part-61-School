'use client';

/**
 * StudentCheckInButton (FTR-02).
 *
 * Rendered on a student's own reservation card. Becomes active 15
 * minutes before the reservation start. Calls
 * dispatch.markStudentPresent (the same procedure the dispatcher
 * uses) which records who and when.
 */
import { useEffect, useState } from 'react';
import { trpc } from '@/lib/trpc/client';

export function StudentCheckInButton({
  reservationId,
  startsAt,
  alreadyCheckedIn,
}: {
  reservationId: string;
  startsAt: string | Date;
  alreadyCheckedIn?: boolean;
}) {
  const [done, setDone] = useState(!!alreadyCheckedIn);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const start = typeof startsAt === 'string' ? new Date(startsAt) : startsAt;
  const minutesUntil = (start.getTime() - now) / 60_000;
  const checkInWindowOpen = minutesUntil <= 15;

  const mark = trpc.dispatch.markStudentPresent.useMutation({
    onSuccess: () => setDone(true),
  });

  if (done) {
    return (
      <span style={{ color: '#16a34a', fontSize: '0.85rem' }}>✓ Checked in</span>
    );
  }
  if (!checkInWindowOpen) {
    return (
      <span style={{ color: '#888', fontSize: '0.85rem' }}>
        Check in opens 15 min before start
      </span>
    );
  }
  return (
    <button
      type="button"
      disabled={mark.isPending}
      onClick={() => mark.mutate({ reservationId })}
      style={{
        padding: '0.25rem 0.75rem',
        background: '#0070f3',
        color: 'white',
        border: 0,
        borderRadius: 4,
        cursor: 'pointer',
      }}
    >
      {mark.isPending ? 'Checking in…' : 'Check in'}
    </button>
  );
}
