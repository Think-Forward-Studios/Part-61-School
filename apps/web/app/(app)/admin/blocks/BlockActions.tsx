'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';

export function BlockActions({ blockId }: { blockId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const deleteMut = trpc.schedule.blocks.delete.useMutation();

  async function onDelete() {
    if (!confirm('Delete this block and all its instances?')) return;
    setBusy(true);
    try {
      await deleteMut.mutateAsync({ blockId });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }
  return (
    <button type="button" onClick={onDelete} disabled={busy}>
      Delete
    </button>
  );
}
