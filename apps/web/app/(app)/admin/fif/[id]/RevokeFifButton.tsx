'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';

export function RevokeFifButton({ noticeId }: { noticeId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const revokeMut = trpc.fif.revoke.useMutation({
    onSuccess: () => {
      router.refresh();
    },
    onError: (e) => setError(e.message),
  });

  return (
    <div>
      {error ? <p style={{ color: 'crimson', fontSize: '0.85rem' }}>{error}</p> : null}
      <button
        type="button"
        disabled={revokeMut.isPending}
        onClick={() => {
          if (!confirm('Revoke this notice? Pilots will no longer see it.')) return;
          revokeMut.mutate({ noticeId });
        }}
        style={{
          padding: '0.5rem 1rem',
          background: '#b91c1c',
          color: 'white',
          border: 0,
          borderRadius: 4,
          cursor: revokeMut.isPending ? 'not-allowed' : 'pointer',
        }}
      >
        {revokeMut.isPending ? 'Revoking…' : 'Revoke notice'}
      </button>
    </div>
  );
}
