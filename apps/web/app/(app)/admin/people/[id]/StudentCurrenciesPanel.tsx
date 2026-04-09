'use client';

/**
 * StudentCurrenciesPanel — Phase 5 mirror of Phase 2 CurrenciesPanel
 * for personnel_currency rows with subject_kind='student'. Uses the
 * admin.studentCurrencies.* router.
 */
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';

interface CurrencyRow {
  id: string;
  kind: string;
  effectiveAt: string;
  expiresAt: string | null;
  notes: string | null;
}

const KINDS = ['medical', 'bfr', 'ipc'] as const;
const WARNING_DAYS: Record<string, number> = {
  medical: 30,
  bfr: 60,
  ipc: 60,
};

function status(expiresAt: string | null, kind: string): { label: string; color: string } {
  if (!expiresAt) return { label: 'unknown', color: '#888' };
  const now = Date.now();
  const exp = new Date(expiresAt).getTime();
  if (exp < now) return { label: 'expired', color: 'crimson' };
  const days = (exp - now) / (1000 * 60 * 60 * 24);
  if (days <= (WARNING_DAYS[kind] ?? 30)) return { label: 'due soon', color: '#b58900' };
  return { label: 'current', color: '#0a7' };
}

export function StudentCurrenciesPanel({ studentUserId }: { studentUserId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const listQ = trpc.admin.studentCurrencies.list.useQuery({ studentUserId });
  const create = trpc.admin.studentCurrencies.record.useMutation();
  const softDelete = trpc.admin.studentCurrencies.softDelete.useMutation();

  const rows: CurrencyRow[] = (listQ.data ?? []).map((c) => ({
    id: c.id,
    kind: c.kind,
    effectiveAt: c.effectiveAt instanceof Date ? c.effectiveAt.toISOString() : String(c.effectiveAt),
    expiresAt: c.expiresAt
      ? c.expiresAt instanceof Date
        ? c.expiresAt.toISOString()
        : String(c.expiresAt)
      : null,
    notes: c.notes ?? null,
  }));

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    try {
      await create.mutateAsync({
        studentUserId,
        kind: fd.get('kind') as (typeof KINDS)[number],
        effectiveAt: new Date(String(fd.get('effectiveAt'))),
        expiresAt: fd.get('expiresAt') ? new Date(String(fd.get('expiresAt'))) : undefined,
        notes: (fd.get('notes') as string) || undefined,
      });
      (e.target as HTMLFormElement).reset();
      await listQ.refetch();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
    }
  }

  async function onDelete(id: string) {
    if (!confirm('Remove this student currency record?')) return;
    await softDelete.mutateAsync({ currencyId: id });
    await listQ.refetch();
    router.refresh();
  }

  return (
    <section style={{ marginTop: '1rem', padding: '1rem', border: '1px solid #ddd', borderRadius: 6 }}>
      <h2>Student Currencies</h2>
      <p style={{ fontSize: '0.8rem', color: '#666' }}>
        Medical, flight review, instrument proficiency check — required for dispatch
        when a lesson declares them.
      </p>
      {error ? <p style={{ color: 'crimson' }}>{error}</p> : null}
      <form onSubmit={onCreate} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <select name="kind" defaultValue="medical">
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {k.toUpperCase()}
            </option>
          ))}
        </select>
        <input name="effectiveAt" type="date" required />
        <input name="expiresAt" type="date" />
        <input name="notes" placeholder="Notes" />
        <button type="submit">Add</button>
      </form>
      {rows.length === 0 ? (
        <p style={{ color: '#888' }}>No student currencies on record.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {rows.map((c) => {
            const s = status(c.expiresAt, c.kind);
            return (
              <li key={c.id} style={{ padding: '0.5rem 0', borderBottom: '1px solid #eee' }}>
                <strong>{c.kind.toUpperCase()}</strong>{' '}
                <span style={{ color: s.color, fontWeight: 'bold' }}>[{s.label}]</span>
                {c.expiresAt ? ` · expires ${new Date(c.expiresAt).toLocaleDateString()}` : ''}
                {' '}
                <button type="button" onClick={() => onDelete(c.id)}>
                  Remove
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
