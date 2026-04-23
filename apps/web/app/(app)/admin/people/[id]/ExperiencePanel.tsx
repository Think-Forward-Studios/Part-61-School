'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';

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

function fmt(s: string | null): string {
  if (s == null) return '—';
  return Number(s).toFixed(1);
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

  return (
    <section
      style={{
        marginTop: '1.25rem',
        padding: '1.1rem 1.25rem',
        background: 'rgba(18, 24, 38, 0.6)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 12,
      }}
    >
      <h2
        style={{
          margin: 0,
          fontSize: '0.72rem',
          fontFamily: String.raw`"JetBrains Mono", ui-monospace, monospace`,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: '#7a869a',
          fontWeight: 600,
        }}
      >
        Flight Experience
      </h2>
      {error ? (
        <p style={{ color: '#f87171', fontSize: '0.82rem', marginTop: '0.5rem' }}>{error}</p>
      ) : null}
      <form
        onSubmit={onCreate}
        style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}
      >
        <input name="asOfDate" type="date" required />
        <input
          name="totalTime"
          type="number"
          step="0.1"
          placeholder="Total"
          style={{ width: 100 }}
        />
        <input name="picTime" type="number" step="0.1" placeholder="PIC" style={{ width: 100 }} />
        <input
          name="instructorTime"
          type="number"
          step="0.1"
          placeholder="CFI"
          style={{ width: 100 }}
        />
        <input
          name="multiEngineTime"
          type="number"
          step="0.1"
          placeholder="ME"
          style={{ width: 100 }}
        />
        <input
          name="instrumentTime"
          type="number"
          step="0.1"
          placeholder="Inst"
          style={{ width: 100 }}
        />
        <input name="notes" placeholder="Notes" />
        <button type="submit">Add snapshot</button>
      </form>
      {experience.length === 0 ? (
        <p style={{ color: '#888' }}>No experience snapshots on record.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #ddd', textAlign: 'left' }}>
              <th>As of</th>
              <th>Total</th>
              <th>PIC</th>
              <th>CFI</th>
              <th>ME</th>
              <th>Inst</th>
            </tr>
          </thead>
          <tbody>
            {experience.map((e) => (
              <tr key={e.id}>
                <td>{new Date(e.asOfDate).toLocaleDateString()}</td>
                <td>{fmt(e.totalTime)}</td>
                <td>{fmt(e.picTime)}</td>
                <td>{fmt(e.instructorTime)}</td>
                <td>{fmt(e.multiEngineTime)}</td>
                <td>{fmt(e.instrumentTime)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
