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
  if (!expiresAt) return { label: 'unknown', color: '#7a869a' };
  const now = Date.now();
  const exp = new Date(expiresAt).getTime();
  if (exp < now) return { label: 'expired', color: '#f87171' };
  const days = (exp - now) / (1000 * 60 * 60 * 24);
  if (days <= (WARNING_DAYS[kind] ?? 30)) return { label: 'due soon', color: '#fbbf24' };
  return { label: 'current', color: '#34d399' };
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
    effectiveAt:
      c.effectiveAt instanceof Date ? c.effectiveAt.toISOString() : String(c.effectiveAt),
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
    <section
      style={{
        marginTop: '1rem',
        padding: '1rem 1.1rem',
        background: '#0d1220',
        border: '1px solid #1f2940',
        borderRadius: 12,
      }}
    >
      <h2
        style={{
          margin: '0 0 0.35rem',
          fontSize: '0.75rem',
          fontFamily: '"JetBrains Mono", ui-monospace, monospace',
          color: '#7a869a',
          textTransform: 'uppercase',
          letterSpacing: '0.15em',
          fontWeight: 500,
        }}
      >
        Student Currencies
      </h2>
      <p style={{ fontSize: '0.8rem', color: '#7a869a', margin: '0 0 0.85rem' }}>
        Medical, flight review, instrument proficiency check — required for dispatch when a lesson
        declares them.
      </p>
      {error ? (
        <p style={{ color: '#f87171', fontSize: '0.8rem', margin: '0 0 0.5rem' }}>{error}</p>
      ) : null}
      <form
        onSubmit={onCreate}
        style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}
      >
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
        <button
          type="submit"
          style={{
            padding: '0.4rem 0.9rem',
            background: 'rgba(52, 211, 153, 0.12)',
            color: '#34d399',
            border: '1px solid rgba(52, 211, 153, 0.35)',
            borderRadius: 6,
            fontSize: '0.7rem',
            fontFamily: '"JetBrains Mono", ui-monospace, monospace',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          + Add
        </button>
      </form>
      {rows.length === 0 ? (
        <p style={{ color: '#5b6784', fontSize: '0.85rem', margin: 0 }}>
          No student currencies on record.
        </p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {rows.map((c) => {
            const s = status(c.expiresAt, c.kind);
            return (
              <li
                key={c.id}
                style={{
                  padding: '0.55rem 0',
                  borderBottom: '1px solid #161d30',
                  color: '#cbd5e1',
                  fontSize: '0.87rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.6rem',
                  flexWrap: 'wrap',
                }}
              >
                <strong
                  style={{
                    color: '#f7f9fc',
                    fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                    letterSpacing: '0.08em',
                  }}
                >
                  {c.kind.toUpperCase()}
                </strong>
                <span
                  style={{
                    color: s.color,
                    fontWeight: 600,
                    fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                    fontSize: '0.7rem',
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                  }}
                >
                  [{s.label}]
                </span>
                {c.expiresAt ? (
                  <span style={{ color: '#7a869a', fontSize: '0.8rem' }}>
                    · expires {new Date(c.expiresAt).toLocaleDateString()}
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={() => onDelete(c.id)}
                  style={{
                    marginLeft: 'auto',
                    padding: '0.25rem 0.65rem',
                    background: 'transparent',
                    color: '#f87171',
                    border: '1px solid rgba(248, 113, 113, 0.3)',
                    borderRadius: 6,
                    fontSize: '0.68rem',
                    fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
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
