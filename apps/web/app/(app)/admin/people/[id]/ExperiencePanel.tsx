'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';
import * as s from './_panelStyles';

interface ExperienceRow {
  id: string;
  totalTime: string | null;
  picTime: string | null;
  instructorTime: string | null;
  multiEngineTime: string | null;
  instrumentTime: string | null;
  asOfDate: string;
  source: string;
  notes: string | null;
}

function fmt(v: string | null): string {
  if (v == null) return '—';
  return Number(v).toFixed(1);
}

export function ExperiencePanel({
  userId,
  experience,
}: {
  userId: string;
  experience: ExperienceRow[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const create = trpc.people.experience.create.useMutation();

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const num = (k: string) => {
      const v = fd.get(k);
      return v ? Number(v) : null;
    };
    try {
      await create.mutateAsync({
        userId,
        totalTime: num('totalTime'),
        picTime: num('picTime'),
        instructorTime: num('instructorTime'),
        multiEngineTime: num('multiEngineTime'),
        instrumentTime: num('instrumentTime'),
        asOfDate: String(fd.get('asOfDate') ?? ''),
        source: 'self_reported',
        notes: (fd.get('notes') as string) || null,
      });
      (e.target as HTMLFormElement).reset();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
    }
  }

  const numberInput: React.CSSProperties = { ...s.input, width: 90 };

  return (
    <section style={s.section}>
      <h2 style={s.heading}>Flight Experience</h2>
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
        <input name="asOfDate" type="date" required style={s.input} />
        <input name="totalTime" type="number" step="0.1" placeholder="Total" style={numberInput} />
        <input name="picTime" type="number" step="0.1" placeholder="PIC" style={numberInput} />
        <input
          name="instructorTime"
          type="number"
          step="0.1"
          placeholder="CFI"
          style={numberInput}
        />
        <input
          name="multiEngineTime"
          type="number"
          step="0.1"
          placeholder="ME"
          style={numberInput}
        />
        <input
          name="instrumentTime"
          type="number"
          step="0.1"
          placeholder="Inst"
          style={numberInput}
        />
        <input name="notes" placeholder="Notes" style={{ ...s.input, flex: 1, minWidth: 140 }} />
        <button type="submit" style={s.primaryButton} disabled={create.isPending}>
          {create.isPending ? 'Saving…' : 'Add snapshot'}
        </button>
      </form>

      {experience.length === 0 ? (
        <p style={s.emptyText}>No experience snapshots on record.</p>
      ) : (
        <div
          style={{
            marginTop: '0.75rem',
            overflow: 'hidden',
            borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.05)',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
            <thead>
              <tr
                style={{
                  background: 'rgba(9, 13, 24, 0.6)',
                  color: '#7a869a',
                  textAlign: 'left',
                  fontSize: '0.7rem',
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                }}
              >
                <th style={thStyle}>As of</th>
                <th style={thStyle}>Total</th>
                <th style={thStyle}>PIC</th>
                <th style={thStyle}>CFI</th>
                <th style={thStyle}>ME</th>
                <th style={thStyle}>Inst</th>
              </tr>
            </thead>
            <tbody>
              {experience.map((e) => (
                <tr key={e.id} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={{ ...tdStyle, color: '#cbd5e1' }}>
                    {new Date(e.asOfDate).toLocaleDateString()}
                  </td>
                  <td style={tdStyle}>{fmt(e.totalTime)}</td>
                  <td style={tdStyle}>{fmt(e.picTime)}</td>
                  <td style={tdStyle}>{fmt(e.instructorTime)}</td>
                  <td style={tdStyle}>{fmt(e.multiEngineTime)}</td>
                  <td style={tdStyle}>{fmt(e.instrumentTime)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

const thStyle: React.CSSProperties = {
  padding: '0.6rem 0.85rem',
  fontWeight: 600,
};

const tdStyle: React.CSSProperties = {
  padding: '0.7rem 0.85rem',
  color: '#e2e8f0',
  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
  fontSize: '0.82rem',
};
