'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';

interface Props {
  sourceVersionId: string;
  defaultCode: string;
  defaultTitle: string;
}

/**
 * ForkCourseButton — calls admin.courses.fork. On success, navigates
 * to the new course detail page so the caller can open the draft
 * version tree editor.
 */
export function ForkCourseButton({ sourceVersionId, defaultCode, defaultTitle }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fork = trpc.admin.courses.fork.useMutation();

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fork.mutateAsync({
        sourceVersionId,
        newCode: String(fd.get('code') ?? '').trim(),
        newTitle: String(fd.get('title') ?? '').trim(),
        description: (fd.get('description') as string) || undefined,
      });
      setOpen(false);
      router.push(`/admin/courses/${res.course?.id ?? ''}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fork failed');
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} style={primaryButton}>
        Fork this template into a school draft
      </button>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      style={{
        padding: '1.1rem 1.25rem',
        background: 'rgba(18, 24, 38, 0.6)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: '0.9rem',
        maxWidth: 560,
      }}
    >
      <div>
        <h3
          style={{
            margin: 0,
            fontSize: '0.72rem',
            fontFamily: '"JetBrains Mono", ui-monospace, monospace',
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: '#7a869a',
            fontWeight: 600,
          }}
        >
          Fork template
        </h3>
        <p
          style={{
            margin: '0.35rem 0 0',
            fontSize: '0.82rem',
            color: '#94a3b8',
            lineHeight: 1.45,
          }}
        >
          Creates an owned school course + a draft version with every stage, unit, lesson, and line
          item deep-copied. You can then edit and publish it on your own schedule.
        </p>
      </div>

      <Field label="New course code">
        <input name="code" defaultValue={defaultCode} required style={inputStyle} maxLength={40} />
      </Field>

      <Field label="New course title">
        <input
          name="title"
          defaultValue={defaultTitle}
          required
          style={inputStyle}
          maxLength={200}
        />
      </Field>

      <Field label="Description (optional)">
        <textarea
          name="description"
          rows={3}
          style={{
            ...inputStyle,
            height: 'auto',
            padding: '0.55rem 0.75rem',
            minHeight: '4rem',
            resize: 'vertical',
            fontFamily: 'inherit',
          }}
        />
      </Field>

      {error ? (
        <p
          style={{
            color: '#f87171',
            fontSize: '0.82rem',
            margin: 0,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {error}
        </p>
      ) : null}

      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
        <button type="button" onClick={() => setOpen(false)} style={ghostButton}>
          Cancel
        </button>
        <button type="submit" disabled={fork.isPending} style={primaryButton}>
          {fork.isPending ? 'Forking…' : 'Fork'}
        </button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
      <span style={labelStyle}>{label}</span>
      {children}
    </label>
  );
}

// --- styles --------------------------------------------------------------

const labelStyle: React.CSSProperties = {
  fontSize: '0.7rem',
  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: '#cbd5e1',
  fontWeight: 600,
};

const inputStyle: React.CSSProperties = {
  height: '2.3rem',
  background: 'rgba(9, 13, 24, 0.85)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 8,
  color: '#e2e8f0',
  padding: '0 0.75rem',
  fontSize: '0.88rem',
  outline: 'none',
  width: '100%',
};

const primaryButton: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  height: '2.3rem',
  padding: '0 1rem',
  background: 'linear-gradient(135deg, #fbbf24, #f59e0b)',
  color: '#0a0e1a',
  border: 'none',
  borderRadius: 8,
  fontSize: '0.88rem',
  fontWeight: 700,
  cursor: 'pointer',
  letterSpacing: '0.01em',
};

const ghostButton: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  height: '2.3rem',
  padding: '0 1rem',
  background: 'transparent',
  border: '1px solid rgba(255,255,255,0.14)',
  borderRadius: 8,
  color: '#cbd5e1',
  fontSize: '0.82rem',
  fontWeight: 600,
  cursor: 'pointer',
};
