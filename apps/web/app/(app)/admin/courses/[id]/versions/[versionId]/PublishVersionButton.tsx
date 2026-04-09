'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';

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
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        style={{
          padding: '0.5rem 1rem',
          background: '#16a34a',
          color: 'white',
          border: 0,
          borderRadius: 4,
          fontWeight: 600,
        }}
      >
        Publish version
      </button>
    );
  }

  return (
    <div
      style={{
        padding: '1rem',
        border: '3px solid #b91c1c',
        borderRadius: 6,
        background: '#fef2f2',
        maxWidth: 520,
      }}
    >
      <strong style={{ color: '#7f1d1d' }}>This is legally binding.</strong>
      <p style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>
        Publishing locks this version and every stage, unit, lesson, and line item
        it contains. Students can then be enrolled into it, and grade sheets
        recorded against it. You cannot edit after publishing — create a new
        version instead.
      </p>
      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
        />
        I certify this version is ready to be published.
      </label>
      {error ? <p style={{ color: 'crimson', fontSize: '0.85rem' }}>{error}</p> : null}
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
        <button type="button" onClick={() => setConfirmOpen(false)}>
          Cancel
        </button>
        <button
          type="button"
          disabled={!checked || publish.isPending}
          onClick={doPublish}
          style={{
            padding: '0.5rem 1rem',
            background: checked ? '#b91c1c' : '#9ca3af',
            color: 'white',
            border: 0,
            borderRadius: 4,
            fontWeight: 600,
            cursor: checked ? 'pointer' : 'not-allowed',
          }}
        >
          {publish.isPending ? 'Publishing…' : 'Sign and publish'}
        </button>
      </div>
    </div>
  );
}
