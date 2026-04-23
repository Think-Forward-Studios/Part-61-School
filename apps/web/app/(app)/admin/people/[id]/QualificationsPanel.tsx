'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';
import * as s from './_panelStyles';

interface QualRow {
  id: string;
  kind: string;
  descriptor: string;
  notes: string | null;
}

const KINDS = ['aircraft_type', 'sim_authorization', 'course_authorization'] as const;

const KIND_LABEL: Record<string, string> = {
  aircraft_type: 'Aircraft type',
  sim_authorization: 'Sim authorization',
  course_authorization: 'Course authorization',
};

export function QualificationsPanel({ userId, quals }: { userId: string; quals: QualRow[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const create = trpc.people.qualifications.create.useMutation();
  const revoke = trpc.people.qualifications.revoke.useMutation();

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    try {
      await create.mutateAsync({
        userId,
        kind: fd.get('kind') as (typeof KINDS)[number],
        descriptor: String(fd.get('descriptor') ?? ''),
        notes: (fd.get('notes') as string) || null,
      });
      (e.target as HTMLFormElement).reset();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
    }
  }

  async function onRevoke(id: string) {
    if (!confirm('Revoke this qualification?')) return;
    await revoke.mutateAsync({ qualificationId: id });
    router.refresh();
  }

  return (
    <section style={s.section}>
      <h2 style={s.heading}>Qualifications</h2>
      {error ? <p style={s.errorText}>{error}</p> : null}

      <form
        onSubmit={onCreate}
        style={{
          display: 'flex',
          gap: '0.5rem',
          marginTop: '0.85rem',
          marginBottom: '0.5rem',
          flexWrap: 'wrap',
        }}
      >
        <select name="kind" defaultValue="aircraft_type" style={s.select}>
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {KIND_LABEL[k] ?? k}
            </option>
          ))}
        </select>
        <input name="descriptor" placeholder="e.g. C172" required style={s.input} />
        <input name="notes" placeholder="Notes" style={{ ...s.input, flex: 1, minWidth: 160 }} />
        <button type="submit" style={s.primaryButton} disabled={create.isPending}>
          {create.isPending ? 'Adding…' : 'Add'}
        </button>
      </form>

      {quals.length === 0 ? (
        <p style={s.emptyText}>No qualifications on record.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: '0.5rem 0 0' }}>
          {quals.map((q) => (
            <li key={q.id} style={s.listRow}>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: '#f7f9fc' }}>
                  <span
                    style={{
                      color: '#94a3b8',
                      fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                      fontSize: '0.78rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      marginRight: '0.4rem',
                    }}
                  >
                    {KIND_LABEL[q.kind] ?? q.kind}
                  </span>
                  <strong style={{ color: '#f7f9fc' }}>{q.descriptor}</strong>
                </div>
                {q.notes ? <div style={s.listRowMeta}>{q.notes}</div> : null}
              </div>
              <button type="button" onClick={() => onRevoke(q.id)} style={s.danger}>
                Revoke
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
