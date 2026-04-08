'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';

type Severity = 'info' | 'important' | 'critical';

export function CreateFifForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const postMut = trpc.fif.post.useMutation();

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const title = String(fd.get('title') ?? '').trim();
    const body = String(fd.get('body') ?? '').trim();
    const severity = String(fd.get('severity') ?? 'info') as Severity;
    const effectiveAtRaw = String(fd.get('effectiveAt') ?? '');
    const expiresAtRaw = String(fd.get('expiresAt') ?? '');
    try {
      if (!title) throw new Error('Title required');
      if (!body) throw new Error('Body required');
      await postMut.mutateAsync({
        title,
        body,
        severity,
        effectiveAt: effectiveAtRaw ? new Date(effectiveAtRaw) : undefined,
        expiresAt: expiresAtRaw ? new Date(expiresAtRaw) : undefined,
      });
      router.push('/admin/fif');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
        marginTop: '1rem',
      }}
    >
      {error ? <p style={{ color: 'crimson' }}>{error}</p> : null}
      <label>
        Title
        <input
          name="title"
          required
          maxLength={200}
          placeholder="Runway 27 NOTAM effective immediately"
          style={{ display: 'block', width: '100%', padding: '0.4rem' }}
        />
      </label>
      <label>
        Body
        <textarea
          name="body"
          required
          maxLength={20000}
          rows={8}
          placeholder={`Plain text. Newlines preserved.`}
          style={{
            display: 'block',
            width: '100%',
            padding: '0.4rem',
            fontFamily: 'inherit',
          }}
        />
      </label>
      <label>
        Severity
        <select name="severity" defaultValue="info" style={{ display: 'block', padding: '0.4rem' }}>
          <option value="info">Info</option>
          <option value="important">Important</option>
          <option value="critical">Critical</option>
        </select>
      </label>
      <label>
        Effective at (optional — defaults to now)
        <input
          name="effectiveAt"
          type="datetime-local"
          style={{ display: 'block', padding: '0.4rem' }}
        />
      </label>
      <label>
        Expires at (optional — blank = never)
        <input
          name="expiresAt"
          type="datetime-local"
          style={{ display: 'block', padding: '0.4rem' }}
        />
      </label>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button
          type="submit"
          disabled={busy}
          style={{
            padding: '0.5rem 1rem',
            background: '#0070f3',
            color: 'white',
            border: 0,
            borderRadius: 4,
            cursor: busy ? 'not-allowed' : 'pointer',
          }}
        >
          {busy ? 'Posting…' : 'Post notice'}
        </button>
      </div>
    </form>
  );
}
