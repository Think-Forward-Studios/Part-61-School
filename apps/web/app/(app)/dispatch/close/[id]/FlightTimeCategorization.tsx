'use client';

/**
 * FlightTimeCategorization — Phase 5 (SYL-14, STU-03).
 *
 * Writes per-person 14 CFR 61.51(e) flight time buckets for a
 * closed-out reservation. One row for the student (dual_received by
 * default) and one row for the instructor (dual_given). Day + night
 * minutes must sum to within ±6 minutes of the paired flight_log_entry
 * airframe delta — the server trigger is the backstop.
 */
import { useState, type FormEvent } from 'react';
import { trpc } from '@/lib/trpc/client';

interface Props {
  reservationId: string;
  flightLogEntryId: string | null;
  studentId: string;
  instructorId: string;
  hobbsDeltaMinutes: number | null;
}

interface Split {
  dayMinutes: number;
  nightMinutes: number;
  crossCountryMinutes: number;
  instrumentActualMinutes: number;
  instrumentSimulatedMinutes: number;
  dayLandings: number;
  nightLandings: number;
  instrumentApproaches: number;
  isSimulator: boolean;
}

function defaultSplit(hobbsDeltaMinutes: number | null): Split {
  const day = hobbsDeltaMinutes ?? 0;
  return {
    dayMinutes: day,
    nightMinutes: 0,
    crossCountryMinutes: 0,
    instrumentActualMinutes: 0,
    instrumentSimulatedMinutes: 0,
    dayLandings: 1,
    nightLandings: 0,
    instrumentApproaches: 0,
    isSimulator: false,
  };
}

export function FlightTimeCategorization({
  reservationId,
  flightLogEntryId,
  studentId,
  instructorId,
  hobbsDeltaMinutes,
}: Props) {
  const categorize = trpc.flightLog.categorize.useMutation();
  const [studentSplit, setStudentSplit] = useState<Split>(() => defaultSplit(hobbsDeltaMinutes));
  const [instructorSplit, setInstructorSplit] = useState<Split>(() =>
    defaultSplit(hobbsDeltaMinutes),
  );
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function validate(s: Split): string | null {
    if (hobbsDeltaMinutes == null || s.isSimulator) return null;
    const total = s.dayMinutes + s.nightMinutes;
    if (Math.abs(total - hobbsDeltaMinutes) > 6) {
      return `Day + night (${total}) must be within ±6 min of hobbs delta (${hobbsDeltaMinutes}).`;
    }
    return null;
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const studentErr = validate(studentSplit);
    if (studentErr) {
      setError(`Student: ${studentErr}`);
      return;
    }
    const instrErr = validate(instructorSplit);
    if (instrErr) {
      setError(`Instructor: ${instrErr}`);
      return;
    }
    try {
      await categorize.mutateAsync({
        reservationId,
        flightLogEntryId: flightLogEntryId ?? undefined,
        splits: [
          {
            userId: studentId,
            kind: 'dual_received',
            dayMinutes: studentSplit.dayMinutes,
            nightMinutes: studentSplit.nightMinutes,
            crossCountryMinutes: studentSplit.crossCountryMinutes,
            instrumentActualMinutes: studentSplit.instrumentActualMinutes,
            instrumentSimulatedMinutes: studentSplit.instrumentSimulatedMinutes,
            isSimulator: studentSplit.isSimulator,
            dayLandings: studentSplit.dayLandings,
            nightLandings: studentSplit.nightLandings,
            instrumentApproaches: studentSplit.instrumentApproaches,
          },
          {
            userId: instructorId,
            kind: 'dual_given',
            dayMinutes: instructorSplit.dayMinutes,
            nightMinutes: instructorSplit.nightMinutes,
            crossCountryMinutes: instructorSplit.crossCountryMinutes,
            instrumentActualMinutes: instructorSplit.instrumentActualMinutes,
            instrumentSimulatedMinutes: instructorSplit.instrumentSimulatedMinutes,
            isSimulator: instructorSplit.isSimulator,
            dayLandings: instructorSplit.dayLandings,
            nightLandings: instructorSplit.nightLandings,
            instrumentApproaches: instructorSplit.instrumentApproaches,
          },
        ],
      });
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      style={{
        marginTop: '1.5rem',
        padding: '1.1rem',
        background: '#0d1220',
        border: '1px solid #1f2940',
        borderRadius: 12,
        color: '#cbd5e1',
      }}
    >
      <h2
        style={{
          marginTop: 0,
          marginBottom: '0.4rem',
          fontSize: '1rem',
          color: '#f7f9fc',
        }}
      >
        Flight time categorization
      </h2>
      <p style={{ fontSize: '0.82rem', color: '#7a869a', margin: 0 }}>
        14 CFR 61.51(e) buckets. Hobbs delta:{' '}
        <strong style={{ color: '#38bdf8' }}>{hobbsDeltaMinutes ?? '—'} min</strong>. Day + night
        must match within ±6 minutes unless the row is a simulator.
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '1rem',
          marginTop: '0.9rem',
        }}
      >
        <SplitRow title="Student (dual received)" split={studentSplit} onChange={setStudentSplit} />
        <SplitRow
          title="Instructor (dual given)"
          split={instructorSplit}
          onChange={setInstructorSplit}
        />
      </div>

      {error ? (
        <p
          style={{
            color: '#f87171',
            background: 'rgba(248, 113, 113, 0.1)',
            border: '1px solid rgba(248, 113, 113, 0.35)',
            borderRadius: 6,
            padding: '0.5rem 0.75rem',
            fontSize: '0.82rem',
            marginTop: '0.75rem',
          }}
        >
          {error}
        </p>
      ) : null}
      {saved ? (
        <p style={{ color: '#34d399', fontSize: '0.85rem', marginTop: '0.75rem' }}>
          Flight time categorized and logged.
        </p>
      ) : null}

      <div style={{ marginTop: '0.9rem' }}>
        <button
          type="submit"
          disabled={categorize.isPending}
          style={{
            padding: '0.5rem 1rem',
            background: 'rgba(56, 189, 248, 0.12)',
            color: '#38bdf8',
            border: '1px solid rgba(56, 189, 248, 0.35)',
            borderRadius: 6,
            fontSize: '0.72rem',
            fontFamily: '"JetBrains Mono", ui-monospace, monospace',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            fontWeight: 600,
            cursor: categorize.isPending ? 'not-allowed' : 'pointer',
            opacity: categorize.isPending ? 0.5 : 1,
          }}
        >
          {categorize.isPending ? 'Saving…' : 'Save flight time categorization'}
        </button>
      </div>
    </form>
  );
}

function SplitRow({
  title,
  split,
  onChange,
}: {
  title: string;
  split: Split;
  onChange: (s: Split) => void;
}) {
  function set<K extends keyof Split>(key: K, value: Split[K]) {
    onChange({ ...split, [key]: value });
  }

  const num = (k: keyof Split, label: string) => (
    <label
      style={{
        display: 'block',
        fontSize: '0.72rem',
        fontFamily: '"JetBrains Mono", ui-monospace, monospace',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: '#7a869a',
      }}
    >
      {label}
      <input
        type="number"
        min={0}
        value={split[k] as number}
        onChange={(e) => set(k, Number(e.target.value) as never)}
        style={{
          width: '100%',
          background: '#0d1220',
          border: '1px solid #293352',
          color: '#f7f9fc',
          padding: '0.3rem 0.5rem',
          borderRadius: 4,
          fontFamily: '"JetBrains Mono", ui-monospace, monospace',
          fontSize: '0.82rem',
          marginTop: '0.2rem',
        }}
      />
    </label>
  );

  return (
    <div
      style={{
        background: '#121826',
        border: '1px solid #1f2940',
        padding: '0.8rem',
        borderRadius: 8,
      }}
    >
      <strong style={{ fontSize: '0.85rem', color: '#f7f9fc' }}>{title}</strong>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '0.5rem',
          marginTop: '0.5rem',
        }}
      >
        {num('dayMinutes', 'Day min')}
        {num('nightMinutes', 'Night min')}
        {num('crossCountryMinutes', 'XC min')}
        {num('instrumentActualMinutes', 'Instr actual')}
        {num('instrumentSimulatedMinutes', 'Instr sim')}
        {num('dayLandings', 'Day ldg')}
        {num('nightLandings', 'Night ldg')}
        {num('instrumentApproaches', 'Approaches')}
      </div>
      <label
        style={{
          fontSize: '0.78rem',
          marginTop: '0.6rem',
          display: 'block',
          color: '#cbd5e1',
        }}
      >
        <input
          type="checkbox"
          checked={split.isSimulator}
          onChange={(e) => set('isSimulator', e.target.checked)}
          style={{ accentColor: '#38bdf8' }}
        />{' '}
        Simulator (skips hobbs gate)
      </label>
    </div>
  );
}
