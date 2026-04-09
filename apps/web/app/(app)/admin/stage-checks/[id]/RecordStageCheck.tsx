'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';

export function RecordStageCheck({ stageCheckId }: { stageCheckId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const record = trpc.admin.stageChecks.record.useMutation();

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    try {
      await record.mutateAsync({
        stageCheckId,
        status: fd.get('status') as 'passed' | 'failed',
        remarks: (fd.get('remarks') as string) || undefined,
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Record failed');
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      style={{
        marginTop: '1rem',
        padding: '1rem',
        border: '3px solid #b91c1c',
        borderRadius: 6,
        background: '#fef2f2',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
      }}
    >
      <strong style={{ color: '#7f1d1d' }}>Sign and record stage check</strong>
      <p style={{ fontSize: '0.85rem', margin: 0 }}>
        This is legally binding. Once recorded, the stage check is sealed with your
        instructor certificate snapshot and cannot be edited.
      </p>
      <fieldset style={{ border: 0, padding: 0 }}>
        <label style={{ marginRight: '1rem' }}>
          <input type="radio" name="status" value="passed" required defaultChecked /> Passed
        </label>
        <label>
          <input type="radio" name="status" value="failed" /> Failed
        </label>
      </fieldset>
      <label style={{ fontSize: '0.85rem' }}>
        Remarks
        <textarea name="remarks" rows={4} style={{ display: 'block', width: '100%' }} />
      </label>
      <label style={{ fontSize: '0.85rem' }}>
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />{' '}
        I certify this stage check was conducted per the school&rsquo;s stage-check
        procedure and that I am not this student&rsquo;s primary instructor.
      </label>
      {error ? <p style={{ color: 'crimson' }}>{error}</p> : null}
      <button
        type="submit"
        disabled={!confirmed || record.isPending}
        style={{
          padding: '0.5rem 1rem',
          background: confirmed ? '#b91c1c' : '#9ca3af',
          color: 'white',
          border: 0,
          borderRadius: 4,
          fontWeight: 600,
          cursor: confirmed ? 'pointer' : 'not-allowed',
        }}
      >
        {record.isPending ? 'Recording…' : 'Sign and record'}
      </button>
    </form>
  );
}
