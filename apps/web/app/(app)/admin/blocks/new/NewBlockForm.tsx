'use client';

/**
 * New schedule block form. Client-side expands a (frequency, days of
 * week, time range, date window) spec into a list of concrete
 * instance tstzrange pairs and posts to schedule.blocks.create.
 */
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

function expandInstances(args: {
  validFrom: Date;
  validUntil: Date;
  daysOfWeek: number[];
  startHHmm: string;
  endHHmm: string;
}): Array<{ startsAt: Date; endsAt: Date }> {
  const out: Array<{ startsAt: Date; endsAt: Date }> = [];
  const [sh, sm] = args.startHHmm.split(':').map(Number) as [number, number];
  const [eh, em] = args.endHHmm.split(':').map(Number) as [number, number];
  const cursor = new Date(args.validFrom);
  cursor.setHours(0, 0, 0, 0);
  for (let i = 0; i < 400 && cursor.getTime() <= args.validUntil.getTime(); i++) {
    if (args.daysOfWeek.includes(cursor.getDay())) {
      const s = new Date(cursor);
      s.setHours(sh, sm, 0, 0);
      const e = new Date(cursor);
      e.setHours(eh, em, 0, 0);
      if (e > s) out.push({ startsAt: s, endsAt: e });
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

export function NewBlockForm({
  aircraftOptions,
  instructorOptions,
  roomOptions,
}: {
  aircraftOptions: Array<{ id: string; label: string }>;
  instructorOptions: Array<{ id: string; label: string }>;
  roomOptions: Array<{ id: string; label: string }>;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [days, setDays] = useState<number[]>([1, 3, 5]);
  const createMut = trpc.schedule.blocks.create.useMutation();

  function toggleDay(d: number) {
    setDays((cur) =>
      cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort(),
    );
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    try {
      const validFrom = new Date(String(fd.get('validFrom') ?? ''));
      const validUntil = new Date(String(fd.get('validUntil') ?? ''));
      const startHHmm = String(fd.get('startTime') ?? '09:00');
      const endHHmm = String(fd.get('endTime') ?? '12:00');
      const instances = expandInstances({
        validFrom,
        validUntil,
        daysOfWeek: days,
        startHHmm,
        endHHmm,
      });
      if (instances.length === 0) {
        setError('No instances materialized — check days and date range');
        setBusy(false);
        return;
      }
      await createMut.mutateAsync({
        kind: fd.get('kind') as
          | 'instructor_block'
          | 'aircraft_block'
          | 'room_block'
          | 'combo',
        instructorId: (fd.get('instructorId') as string) || null,
        aircraftId: (fd.get('aircraftId') as string) || null,
        roomId: (fd.get('roomId') as string) || null,
        notes: (fd.get('notes') as string) || null,
        instances,
      });
      router.push('/admin/blocks');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
    >
      {error ? <p style={{ color: 'crimson' }}>{error}</p> : null}
      <label>
        Kind{' '}
        <select name="kind" defaultValue="instructor_block">
          <option value="instructor_block">Instructor block</option>
          <option value="aircraft_block">Aircraft block</option>
          <option value="room_block">Room block</option>
          <option value="combo">Combo</option>
        </select>
      </label>
      <label>
        Instructor{' '}
        <select name="instructorId" defaultValue="">
          <option value="">— none —</option>
          {instructorOptions.map((i) => (
            <option key={i.id} value={i.id}>
              {i.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Aircraft{' '}
        <select name="aircraftId" defaultValue="">
          <option value="">— none —</option>
          {aircraftOptions.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Room{' '}
        <select name="roomId" defaultValue="">
          <option value="">— none —</option>
          {roomOptions.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>
      </label>
      <div>
        Days of week:{' '}
        {DAYS.map((name, idx) => (
          <label key={name} style={{ marginRight: '0.5rem' }}>
            <input
              type="checkbox"
              checked={days.includes(idx)}
              onChange={() => toggleDay(idx)}
            />{' '}
            {name}
          </label>
        ))}
      </div>
      <label>
        Start time <input name="startTime" type="time" defaultValue="09:00" />
      </label>
      <label>
        End time <input name="endTime" type="time" defaultValue="12:00" />
      </label>
      <label>
        Valid from <input name="validFrom" type="date" required />
      </label>
      <label>
        Valid until <input name="validUntil" type="date" required />
      </label>
      <label>
        Notes <textarea name="notes" rows={2} style={{ width: '100%' }} />
      </label>
      <button type="submit" disabled={busy}>
        {busy ? 'Creating…' : 'Create block'}
      </button>
    </form>
  );
}
