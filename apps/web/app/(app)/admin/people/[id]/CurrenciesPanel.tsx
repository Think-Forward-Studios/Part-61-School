'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';
import * as s from './_panelStyles';

interface CurrencyRow {
  id: string;
  kind: string;
  effectiveAt: string;
  expiresAt: string | null;
  notes: string | null;
}

const KINDS = ['cfi', 'cfii', 'mei', 'medical', 'bfr', 'ipc'] as const;
const WARNING_DAYS: Record<string, number> = {
  cfi: 30,
  cfii: 30,
  mei: 30,
  medical: 30,
  bfr: 60,
  ipc: 60,
};

interface StatusDescriptor {
  label: string;
  bg: string;
  fg: string;
  border: string;
}

function statusFor(expiresAt: string | null, kind: string): StatusDescriptor {
  if (!expiresAt) {
    return {
      label: 'unknown',
      bg: 'rgba(122, 134, 154, 0.14)',
      fg: '#7a869a',
      border: 'rgba(122, 134, 154, 0.4)',
    };
  }
  const now = Date.now();
  const exp = new Date(expiresAt).getTime();
  if (exp < now) {
    return {
      label: 'expired',
      bg: 'rgba(248, 113, 113, 0.14)',
      fg: '#fca5a5',
      border: 'rgba(248, 113, 113, 0.4)',
    };
  }
  const days = (exp - now) / (1000 * 60 * 60 * 24);
  if (days <= (WARNING_DAYS[kind] ?? 30)) {
    return {
      label: 'due soon',
      bg: 'rgba(251, 191, 36, 0.14)',
      fg: '#fbbf24',
      border: 'rgba(251, 191, 36, 0.4)',
    };
  }
  return {
    label: 'current',
    bg: 'rgba(52, 211, 153, 0.14)',
    fg: '#6ee7b7',
    border: 'rgba(52, 211, 153, 0.4)',
  };
}

export function CurrenciesPanel({
  userId,
  currencies,
}: {
  userId: string;
  currencies: CurrencyRow[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const create = trpc.people.currencies.create.useMutation();
  const softDelete = trpc.people.currencies.softDelete.useMutation();

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    try {
      await create.mutateAsync({
        userId,
        kind: fd.get('kind') as (typeof KINDS)[number],
        effectiveAt: new Date(String(fd.get('effectiveAt'))),
        expiresAt: fd.get('expiresAt') ? new Date(String(fd.get('expiresAt'))) : null,
        notes: (fd.get('notes') as string) || null,
      });
      (e.target as HTMLFormElement).reset();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
    }
  }

  async function onDelete(id: string) {
    if (!confirm('Remove this currency record?')) return;
    await softDelete.mutateAsync({ currencyId: id });
    router.refresh();
  }

  return (
    <section style={s.section}>
      <h2 style={s.heading}>Instructor Currencies</h2>
      {error ? <p style={s.errorText}>{error}</p> : null}

      <form
        onSubmit={onCreate}
        style={{
          display: 'flex',
          gap: '0.5rem',
          flexWrap: 'wrap',
          marginTop: '0.85rem',
          marginBottom: '0.5rem',
        }}
      >
        <select name="kind" defaultValue="medical" style={s.select}>
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {k.toUpperCase()}
            </option>
          ))}
        </select>
        <input name="effectiveAt" type="date" required style={s.input} />
        <input name="expiresAt" type="date" style={s.input} />
        <input name="notes" placeholder="Notes" style={{ ...s.input, flex: 1, minWidth: 160 }} />
        <button type="submit" style={s.primaryButton} disabled={create.isPending}>
          {create.isPending ? 'Adding…' : 'Add'}
        </button>
      </form>

      {currencies.length === 0 ? (
        <p style={s.emptyText}>No currencies on record.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: '0.5rem 0 0' }}>
          {currencies.map((c) => {
            const st = statusFor(c.expiresAt, c.kind);
            return (
              <li key={c.id} style={s.listRow}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', minWidth: 0 }}>
                  <strong style={{ color: '#f7f9fc' }}>{c.kind.toUpperCase()}</strong>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      padding: '0.1rem 0.45rem',
                      background: st.bg,
                      border: `1px solid ${st.border}`,
                      borderRadius: 999,
                      color: st.fg,
                      fontSize: '0.65rem',
                      fontWeight: 700,
                      letterSpacing: '0.1em',
                      textTransform: 'uppercase',
                      fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                    }}
                  >
                    {st.label}
                  </span>
                  {c.expiresAt ? (
                    <span style={{ color: '#94a3b8', fontSize: '0.82rem' }}>
                      · expires {new Date(c.expiresAt).toLocaleDateString()}
                    </span>
                  ) : null}
                </div>
                <button type="button" onClick={() => onDelete(c.id)} style={s.danger}>
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
