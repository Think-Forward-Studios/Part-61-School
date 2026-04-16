'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc/client';

interface Props {
  reservationId: string;
}

export function ReservationApproveInline({ reservationId }: Props) {
  const utils = trpc.useUtils();
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [errMsg, setErrMsg] = useState('');

  const confirmMut = trpc.schedule.approve.useMutation({
    onSuccess: () => {
      setStatus('done');
      void utils.schedule.listRequestedForMe.invalidate();
    },
    onError: (e) => {
      setStatus('error');
      setErrMsg(e.message);
    },
  });

  const cancelMut = trpc.schedule.cancel.useMutation({
    onSuccess: () => {
      setStatus('done');
      void utils.schedule.listRequestedForMe.invalidate();
    },
    onError: (e) => {
      setStatus('error');
      setErrMsg(e.message);
    },
  });

  if (status === 'done') {
    return <span style={{ color: '#16a34a', fontSize: '0.8rem' }}>Done</span>;
  }
  if (status === 'error') {
    return <span style={{ color: '#dc2626', fontSize: '0.75rem' }}>{errMsg || 'Error'}</span>;
  }

  const busy = status === 'loading' || confirmMut.isPending || cancelMut.isPending;

  return (
    <span style={{ display: 'flex', gap: '0.35rem' }}>
      <button
        disabled={busy}
        onClick={() => {
          setStatus('loading');
          confirmMut.mutate({ reservationId });
        }}
        style={{
          padding: '0.2rem 0.5rem',
          fontSize: '0.75rem',
          background: '#16a34a',
          color: 'white',
          border: 'none',
          borderRadius: 4,
          cursor: busy ? 'not-allowed' : 'pointer',
          opacity: busy ? 0.6 : 1,
        }}
      >
        Confirm
      </button>
      <button
        disabled={busy}
        onClick={() => {
          setStatus('loading');
          cancelMut.mutate({ reservationId, reason: 'cancelled_free' });
        }}
        style={{
          padding: '0.2rem 0.5rem',
          fontSize: '0.75rem',
          background: '#dc2626',
          color: 'white',
          border: 'none',
          borderRadius: 4,
          cursor: busy ? 'not-allowed' : 'pointer',
          opacity: busy ? 0.6 : 1,
        }}
      >
        Deny
      </button>
    </span>
  );
}
