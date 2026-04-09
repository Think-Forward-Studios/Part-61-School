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
  const [studentSplit, setStudentSplit] = useState<Split>(() =>
    defaultSplit(hobbsDeltaMinutes),
  );
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
        padding: '1rem',
        border: '1px solid #ddd',
        borderRadius: 6,
      }}
    >
      <h2 style={{ marginTop: 0 }}>Flight time categorization</h2>
      <p style={{ fontSize: '0.85rem', color: '#666', margin: 0 }}>
        14 CFR 61.51(e) buckets. Hobbs delta:{' '}
        <strong>{hobbsDeltaMinutes ?? '—'} min</strong>. Day + night must match within
        ±6 minutes unless the row is a simulator.
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '1rem',
          marginTop: '0.75rem',
        }}
      >
        <SplitRow title="Student (dual received)" split={studentSplit} onChange={setStudentSplit} />
        <SplitRow
          title="Instructor (dual given)"
          split={instructorSplit}
          onChange={setInstructorSplit}
        />
      </div>

      {error ? <p style={{ color: 'crimson' }}>{error}</p> : null}
      {saved ? (
        <p style={{ color: '#16a34a' }}>Flight time categorized and logged.</p>
      ) : null}

      <div style={{ marginTop: '0.75rem' }}>
        <button
          type="submit"
          disabled={categorize.isPending}
          style={{
            padding: '0.5rem 1rem',
            background: '#2563eb',
            color: 'white',
            border: 0,
            borderRadius: 4,
            fontWeight: 600,
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
    <label style={{ display: 'block', fontSize: '0.8rem' }}>
      {label}
      <input
        type="number"
        min={0}
        value={split[k] as number}
        onChange={(e) => set(k, Number(e.target.value) as never)}
        style={{ width: '100%' }}
      />
    </label>
  );

  return (
    <div style={{ border: '1px solid #eee', padding: '0.5rem', borderRadius: 4 }}>
      <strong style={{ fontSize: '0.9rem' }}>{title}</strong>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '0.25rem',
          marginTop: '0.25rem',
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
      <label style={{ fontSize: '0.8rem', marginTop: '0.25rem', display: 'block' }}>
        <input
          type="checkbox"
          checked={split.isSimulator}
          onChange={(e) => set('isSimulator', e.target.checked)}
        />{' '}
        Simulator (skips hobbs gate)
      </label>
    </div>
  );
}
