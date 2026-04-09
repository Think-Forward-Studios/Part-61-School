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
export function ForkCourseButton({
  sourceVersionId,
  defaultCode,
  defaultTitle,
}: Props) {
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
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          padding: '0.5rem 1rem',
          background: '#2563eb',
          color: 'white',
          border: 0,
          borderRadius: 4,
          cursor: 'pointer',
          fontWeight: 600,
        }}
      >
        Fork this template into a school draft
      </button>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      style={{
        padding: '1rem',
        border: '1px solid #2563eb',
        borderRadius: 6,
        background: '#eff6ff',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
        maxWidth: 480,
      }}
    >
      <strong>Fork template</strong>
      <p style={{ fontSize: '0.8rem', color: '#555', margin: 0 }}>
        Creates an owned school course + a draft version with every stage,
        unit, lesson, and line item deep-copied. You can then edit and
        publish it on your own schedule.
      </p>
      <label style={{ fontSize: '0.85rem' }}>
        New course code
        <input
          name="code"
          defaultValue={defaultCode}
          required
          style={{ display: 'block', width: '100%' }}
        />
      </label>
      <label style={{ fontSize: '0.85rem' }}>
        New course title
        <input
          name="title"
          defaultValue={defaultTitle}
          required
          style={{ display: 'block', width: '100%' }}
        />
      </label>
      <label style={{ fontSize: '0.85rem' }}>
        Description (optional)
        <textarea name="description" rows={2} style={{ display: 'block', width: '100%' }} />
      </label>
      {error ? <p style={{ color: 'crimson', fontSize: '0.85rem' }}>{error}</p> : null}
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button type="button" onClick={() => setOpen(false)}>
          Cancel
        </button>
        <button
          type="submit"
          disabled={fork.isPending}
          style={{
            padding: '0.5rem 1rem',
            background: '#2563eb',
            color: 'white',
            border: 0,
            borderRadius: 4,
            fontWeight: 600,
          }}
        >
          {fork.isPending ? 'Forking…' : 'Fork'}
        </button>
      </div>
    </form>
  );
}
