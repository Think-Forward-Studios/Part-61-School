'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';
import { Button } from '@/components/ui';

/**
 * PublishVersionButton — ceremonial publish action. Sealing is permanent;
 * students can be enrolled into this version after it is published.
 */
export function PublishVersionButton({ versionId }: { versionId: string }) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const publish = trpc.admin.courses.publish.useMutation();

  async function doPublish() {
    setError(null);
    try {
      await publish.mutateAsync({ versionId });
      setConfirmOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Publish failed');
    }
  }

  if (!confirmOpen) {
    return (
      <Button variant="primary" onClick={() => setConfirmOpen(true)}>
        Publish version
      </Button>
    );
  }

  return (
    <div
      style={{
        padding: '1rem',
        border: '1px solid rgba(248, 113, 113, 0.45)',
        borderRadius: 8,
        background: 'rgba(248, 113, 113, 0.08)',
        maxWidth: 560,
      }}
    >
      <strong
        style={{
          color: '#f87171',
          display: 'block',
          fontFamily: '"JetBrains Mono", ui-monospace, monospace',
          fontSize: '0.78rem',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
        }}
      >
        This is legally binding.
      </strong>
      <p style={{ fontSize: '0.85rem', marginTop: '0.35rem', color: '#cbd5e1' }}>
        Publishing locks this version and every stage, unit, lesson, and line item it contains.
        Students can then be enrolled into it, and grade sheets recorded against it. You cannot edit
        after publishing — create a new version instead.
      </p>
      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          fontSize: '0.85rem',
          color: '#cbd5e1',
          margin: '0.5rem 0',
        }}
      >
        <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />I
        certify this version is ready to be published.
      </label>
      {error ? (
        <p style={{ color: '#f87171', fontSize: '0.85rem', margin: '0.25rem 0' }}>{error}</p>
      ) : null}
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
        <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
          Cancel
        </Button>
        <Button variant="danger" disabled={!checked || publish.isPending} onClick={doPublish}>
          {publish.isPending ? 'Publishing…' : 'Sign and publish'}
        </Button>
      </div>
    </div>
  );
}
