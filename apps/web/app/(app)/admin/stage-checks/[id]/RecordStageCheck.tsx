'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';
import { Button } from '@/components/ui';

const INPUT_LABEL: React.CSSProperties = {
  fontSize: '0.85rem',
  color: '#cbd5e1',
  display: 'block',
};

const TEXTAREA: React.CSSProperties = {
  display: 'block',
  width: '100%',
  marginTop: '0.25rem',
  padding: '0.5rem 0.65rem',
  background: '#121826',
  border: '1px solid #1f2940',
  borderRadius: 6,
  color: '#f7f9fc',
  fontFamily: 'inherit',
  fontSize: '0.88rem',
};

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
        padding: '1.1rem',
        border: '1px solid rgba(248, 113, 113, 0.45)',
        borderRadius: 8,
        background: 'rgba(248, 113, 113, 0.08)',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.65rem',
      }}
    >
      <strong
        style={{
          color: '#f87171',
          fontFamily: '"JetBrains Mono", ui-monospace, monospace',
          fontSize: '0.78rem',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
        }}
      >
        Sign and record stage check
      </strong>
      <p style={{ fontSize: '0.85rem', margin: 0, color: '#cbd5e1' }}>
        This is legally binding. Once recorded, the stage check is sealed with your instructor
        certificate snapshot and cannot be edited.
      </p>
      <fieldset
        style={{
          border: 0,
          padding: 0,
          color: '#cbd5e1',
          fontSize: '0.88rem',
          display: 'flex',
          gap: '1.5rem',
        }}
      >
        <label>
          <input type="radio" name="status" value="passed" required defaultChecked /> Passed
        </label>
        <label>
          <input type="radio" name="status" value="failed" /> Failed
        </label>
      </fieldset>
      <label style={INPUT_LABEL}>
        Remarks
        <textarea name="remarks" rows={4} style={TEXTAREA} />
      </label>
      <label style={{ ...INPUT_LABEL, display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          style={{ marginTop: '0.2rem' }}
        />
        <span>
          I certify this stage check was conducted per the school&rsquo;s stage-check procedure and
          that I am not this student&rsquo;s primary instructor.
        </span>
      </label>
      {error ? <p style={{ color: '#f87171', margin: 0 }}>{error}</p> : null}
      <div>
        <Button type="submit" variant="danger" disabled={!confirmed || record.isPending}>
          {record.isPending ? 'Recording…' : 'Sign and record'}
        </Button>
      </div>
    </form>
  );
}
