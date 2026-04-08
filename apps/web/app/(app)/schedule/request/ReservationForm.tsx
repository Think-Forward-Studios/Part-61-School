'use client';

/**
 * Reservation request form (SCH-01, SCH-06, SCH-13).
 *
 * Uses react-hook-form + zod. Activity type drives conditional fields:
 *   flight → aircraft + (optional XC expander)
 *   simulator → aircraft (sim tail)
 *   oral / academic → room
 *   misc → no resource required
 * Recurring expander posts a `recurrence` object to schedule.request
 * which the server expands into N child rows sharing a series_id.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { trpc } from '@/lib/trpc/client';

type FormValues = {
  activityType: 'flight' | 'simulator' | 'oral' | 'academic' | 'misc';
  startsAt: string;
  endsAt: string;
  aircraftId?: string;
  instructorId?: string;
  studentId?: string;
  roomId?: string;
  notes?: string;
  recurring: boolean;
  frequency?: 'daily' | 'weekly';
  count?: number;
  until?: string;
  isXc: boolean;
  routeString?: string;
  eteMinutes?: number;
  stops?: string;
  fuelStops?: string;
  alternate?: string;
};

function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

export function ReservationForm({
  initialStart,
  initialEnd,
  currentUserId,
  aircraftOptions,
  instructorOptions,
  roomOptions,
}: {
  initialStart: string | null;
  initialEnd: string | null;
  currentUserId: string;
  aircraftOptions: Array<{ id: string; label: string }>;
  instructorOptions: Array<{ id: string; label: string }>;
  roomOptions: Array<{ id: string; label: string }>;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const requestMut = trpc.schedule.request.useMutation();

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    defaultValues: {
      activityType: 'flight',
      startsAt: toLocalInput(initialStart),
      endsAt: toLocalInput(initialEnd),
      recurring: false,
      isXc: false,
    },
  });

  const activityType = watch('activityType');
  const recurring = watch('recurring');
  const isXc = watch('isXc');

  async function onSubmit(v: FormValues) {
    setError(null);
    try {
      const studentId = v.studentId || currentUserId;
      const res = await requestMut.mutateAsync({
        activityType: v.activityType,
        startsAt: new Date(v.startsAt),
        endsAt: new Date(v.endsAt),
        aircraftId: v.aircraftId || null,
        instructorId: v.instructorId || null,
        studentId: studentId || null,
        roomId: v.roomId || null,
        notes: v.notes ?? null,
        ...(v.isXc && v.activityType === 'flight'
          ? {
              routeString: v.routeString ?? null,
              eteMinutes: v.eteMinutes ?? null,
              stops: v.stops
                ? v.stops.split(',').map((s) => s.trim()).filter(Boolean)
                : null,
              fuelStops: v.fuelStops
                ? v.fuelStops
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean)
                : null,
              alternate: v.alternate ?? null,
            }
          : {}),
        ...(v.recurring && v.frequency
          ? {
              recurrence: {
                frequency: v.frequency,
                count: v.count ?? undefined,
                until: v.until ? new Date(v.until) : undefined,
              },
            }
          : {}),
      });
      const first = res?.reservationIds?.[0];
      if (first) {
        router.push(`/schedule/${first}`);
      } else {
        router.push('/schedule');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    }
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
    >
      {error ? <p style={{ color: 'crimson' }}>{error}</p> : null}
      <label>
        Activity{' '}
        <select {...register('activityType')}>
          <option value="flight">Flight</option>
          <option value="simulator">Simulator</option>
          <option value="oral">Oral</option>
          <option value="academic">Academic</option>
          <option value="misc">Misc</option>
        </select>
      </label>
      <label>
        Start <input type="datetime-local" {...register('startsAt')} />
      </label>
      <label>
        End <input type="datetime-local" {...register('endsAt')} />
        {errors.endsAt ? (
          <span style={{ color: 'crimson', marginLeft: 8 }}>
            {errors.endsAt.message}
          </span>
        ) : null}
      </label>
      {activityType === 'flight' || activityType === 'simulator' ? (
        <label>
          Aircraft{' '}
          <select {...register('aircraftId')}>
            <option value="">— none —</option>
            {aircraftOptions.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {activityType === 'oral' || activityType === 'academic' ? (
        <label>
          Room{' '}
          <select {...register('roomId')}>
            <option value="">— none —</option>
            {roomOptions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label>
        Instructor{' '}
        <select {...register('instructorId')}>
          <option value="">— none —</option>
          {instructorOptions.map((i) => (
            <option key={i.id} value={i.id}>
              {i.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Notes{' '}
        <textarea rows={3} {...register('notes')} style={{ width: '100%' }} />
      </label>
      <fieldset style={{ padding: '0.5rem' }}>
        <legend>
          <label>
            <input type="checkbox" {...register('recurring')} /> Recurring
          </label>
        </legend>
        {recurring ? (
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <label>
              Frequency{' '}
              <select {...register('frequency')}>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </select>
            </label>
            <label>
              Count <input type="number" min={1} max={104} {...register('count')} />
            </label>
            <label>
              Until <input type="date" {...register('until')} />
            </label>
          </div>
        ) : null}
      </fieldset>
      {activityType === 'flight' ? (
        <fieldset style={{ padding: '0.5rem' }}>
          <legend>
            <label>
              <input type="checkbox" {...register('isXc')} /> Cross-country
            </label>
          </legend>
          {isXc ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label>
                Route <input {...register('routeString')} placeholder="KXXX KAAA KBBB" />
              </label>
              <label>
                ETE (min) <input type="number" {...register('eteMinutes')} />
              </label>
              <label>
                Stops <input {...register('stops')} placeholder="KAAA,KBBB" />
              </label>
              <label>
                Fuel stops <input {...register('fuelStops')} />
              </label>
              <label>
                Alternate <input {...register('alternate')} />
              </label>
            </div>
          ) : null}
        </fieldset>
      ) : null}
      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Requesting…' : 'Request reservation'}
      </button>
    </form>
  );
}
