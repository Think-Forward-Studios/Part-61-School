'use client';

/**
 * CloseOutForm (SCH-08, SCH-09, INS-04, FTR-08).
 *
 * Sections:
 *   - Times: hobbs in, tach in
 *   - Fuel / oil
 *   - Route flown
 *   - Squawks (dynamic add: title, description, severity)
 *   - Notes
 *   - Sign-off (instructor or admin only)
 *
 * Save draft (student) → reservation.status = pending_sign_off
 * Close flight (instructor) → reservation.status = closed
 *
 * Uses react-hook-form WITHOUT zodResolver (mirrors Wave 3 pattern —
 * version clash between @hookform/resolvers/zod and rhf 7.72).
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useFieldArray } from 'react-hook-form';
import { trpc } from '@/lib/trpc/client';

type Severity = 'info' | 'watch' | 'grounding';

type SquawkRow = {
  title: string;
  description: string;
  severity: Severity;
};

type FormValues = {
  hobbsIn: string;
  tachIn: string;
  fuelGal: string;
  oilQt: string;
  routeFlown: string;
  notes: string;
  squawks: SquawkRow[];
};

export function CloseOutForm({
  reservationId,
  activityType,
  canSignOff,
}: {
  reservationId: string;
  activityType: string;
  canSignOff: boolean;
}) {
  const router = useRouter();
  const isFlight = activityType === 'flight';
  const [error, setError] = useState<string | null>(null);

  const { register, control, handleSubmit, formState } = useForm<FormValues>({
    defaultValues: {
      hobbsIn: '',
      tachIn: '',
      fuelGal: '',
      oilQt: '',
      routeFlown: '',
      notes: '',
      squawks: [],
    },
  });

  const { fields, append, remove } = useFieldArray<FormValues, 'squawks'>({
    control,
    name: 'squawks',
  });

  const closeOut = trpc.dispatch.closeOut.useMutation();

  async function submit(values: FormValues, signedOff: boolean) {
    setError(null);
    try {
      const res = await closeOut.mutateAsync({
        reservationId,
        hobbsIn: isFlight && values.hobbsIn ? Number(values.hobbsIn) : null,
        tachIn: isFlight && values.tachIn ? Number(values.tachIn) : null,
        fuelGal: values.fuelGal ? Number(values.fuelGal) : null,
        oilQt: values.oilQt ? Number(values.oilQt) : null,
        routeFlown: values.routeFlown || null,
        notes: values.notes || null,
        signedOffByInstructor: signedOff,
        squawks: values.squawks
          .filter((s) => s.title.trim().length > 0)
          .map((s) => ({
            title: s.title,
            description: s.description || null,
            severity: s.severity,
          })),
      });
      if (res.status === 'closed') {
        router.push('/dispatch');
      } else {
        router.push('/dispatch');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Close-out failed');
    }
  }

  const onSaveDraft = handleSubmit((v) => submit(v, false));
  const onCloseFlight = handleSubmit((v) => submit(v, true));

  return (
    <form
      style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
      onSubmit={(e) => e.preventDefault()}
    >
      {error ? <p style={{ color: 'crimson' }}>{error}</p> : null}

      {isFlight ? (
        <fieldset
          style={{
            border: '1px solid #e5e7eb',
            borderRadius: 6,
            padding: '0.75rem',
          }}
        >
          <legend>Times</legend>
          <label style={{ display: 'block' }}>
            Hobbs in{' '}
            <input
              type="number"
              step="0.1"
              {...register('hobbsIn', { required: isFlight })}
            />
          </label>
          <label style={{ display: 'block' }}>
            Tach in{' '}
            <input
              type="number"
              step="0.1"
              {...register('tachIn', { required: isFlight })}
            />
          </label>
        </fieldset>
      ) : null}

      <fieldset
        style={{
          border: '1px solid #e5e7eb',
          borderRadius: 6,
          padding: '0.75rem',
        }}
      >
        <legend>Fuel / oil</legend>
        <label style={{ display: 'block' }}>
          Fuel added (gal) <input type="number" step="0.1" {...register('fuelGal')} />
        </label>
        <label style={{ display: 'block' }}>
          Oil added (qt) <input type="number" step="0.1" {...register('oilQt')} />
        </label>
      </fieldset>

      <fieldset
        style={{
          border: '1px solid #e5e7eb',
          borderRadius: 6,
          padding: '0.75rem',
        }}
      >
        <legend>Route flown</legend>
        <textarea
          {...register('routeFlown')}
          rows={2}
          style={{ width: '100%' }}
          placeholder="e.g. KXXX KAAA KXXX"
        />
      </fieldset>

      <fieldset
        style={{
          border: '1px solid #e5e7eb',
          borderRadius: 6,
          padding: '0.75rem',
        }}
      >
        <legend>Squawks observed</legend>
        {fields.length === 0 ? (
          <p style={{ color: '#888', fontSize: '0.85rem' }}>No squawks.</p>
        ) : null}
        {fields.map((f, i) => (
          <div
            key={f.id}
            style={{
              display: 'grid',
              gridTemplateColumns: '2fr 3fr 1fr auto',
              gap: '0.5rem',
              marginBottom: '0.5rem',
            }}
          >
            <input placeholder="Title" {...register(`squawks.${i}.title` as const)} />
            <input
              placeholder="Description"
              {...register(`squawks.${i}.description` as const)}
            />
            <select {...register(`squawks.${i}.severity` as const)}>
              <option value="info">info</option>
              <option value="watch">watch</option>
              <option value="grounding">grounding</option>
            </select>
            <button type="button" onClick={() => remove(i)}>
              ✕
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            append({ title: '', description: '', severity: 'info' })
          }
        >
          + Add squawk
        </button>
        <p style={{ color: '#888', fontSize: '0.75rem', marginTop: '0.5rem' }}>
          Severity = grounding will automatically ground the aircraft.
        </p>
      </fieldset>

      <fieldset
        style={{
          border: '1px solid #e5e7eb',
          borderRadius: 6,
          padding: '0.75rem',
        }}
      >
        <legend>Notes</legend>
        <textarea
          {...register('notes')}
          rows={3}
          style={{ width: '100%' }}
        />
      </fieldset>

      <div
        style={{
          display: 'flex',
          gap: '0.5rem',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div />
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            type="button"
            onClick={onSaveDraft}
            disabled={formState.isSubmitting || closeOut.isPending}
          >
            Save draft
          </button>
          {canSignOff ? (
            <button
              type="button"
              onClick={onCloseFlight}
              disabled={formState.isSubmitting || closeOut.isPending}
              style={{
                padding: '0.5rem 1rem',
                background: '#16a34a',
                color: 'white',
                border: 0,
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              Sign off &amp; close flight
            </button>
          ) : null}
        </div>
      </div>
    </form>
  );
}
