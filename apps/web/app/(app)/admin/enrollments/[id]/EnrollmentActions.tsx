'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';

export function EnrollmentActions({ enrollmentId }: { enrollmentId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const markComplete = trpc.admin.enrollments.markComplete.useMutation();
  const withdraw = trpc.admin.enrollments.withdraw.useMutation();

  async function onComplete() {
    if (!confirm('Mark this enrollment complete?')) return;
    setError(null);
    try {
      await markComplete.mutateAsync({ enrollmentId });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    }
  }

  async function onWithdraw() {
    const reason = prompt('Reason for withdrawal:');
    if (!reason) return;
    setError(null);
    try {
      await withdraw.mutateAsync({ enrollmentId, reason });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    }
  }

  return (
    <section style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
      <button
        type="button"
        onClick={onComplete}
        disabled={markComplete.isPending}
        style={{ padding: '0.5rem 1rem', background: '#16a34a', color: 'white', border: 0, borderRadius: 4 }}
      >
        Mark complete
      </button>
      <button
        type="button"
        onClick={onWithdraw}
        disabled={withdraw.isPending}
        style={{ padding: '0.5rem 1rem' }}
      >
        Withdraw
      </button>
      {error ? <span style={{ color: 'crimson' }}>{error}</span> : null}
    </section>
  );
}
