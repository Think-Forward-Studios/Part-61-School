'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';

export function ApplyAdToFleetButton({ adId }: { adId: string }) {
  const router = useRouter();
  const apply = trpc.admin.ads.applyToFleet.useMutation();
  const [msg, setMsg] = useState<string | null>(null);

  async function onClick() {
    setMsg(null);
    try {
      const res = await apply.mutateAsync({ adId });
      setMsg(`${res.newComplianceRows} new aircraft compliance row(s)`);
      router.refresh();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Apply failed');
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        disabled={apply.isPending}
        style={{
          padding: '0.25rem 0.6rem',
          background: '#0070f3',
          color: 'white',
          border: 0,
          borderRadius: 3,
          fontSize: '0.8rem',
          cursor: apply.isPending ? 'wait' : 'pointer',
        }}
      >
        {apply.isPending ? 'Applying…' : 'Apply to fleet'}
      </button>
      {msg ? (
        <span style={{ marginLeft: '0.5rem', fontSize: '0.8rem', color: '#16a34a' }}>
          {msg}
        </span>
      ) : null}
    </>
  );
}
