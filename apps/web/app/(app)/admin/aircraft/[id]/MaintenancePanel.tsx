'use client';

/**
 * MaintenancePanel — drops into the aircraft detail page alongside
 * EnginesPanel / EquipmentPanel / RecentFlightsPanel.
 *
 * Surfaces:
 *  - Red banner if aircraft.grounded_at is not null
 *  - Active §91.409(b) overrun countdown (if any)
 *  - Summary counts (current / due_soon / overdue / grounding)
 *  - "View all" link into /admin/aircraft/[id]/maintenance
 *  - IA-only "Request §91.409 overrun" CTA when blocking item is a
 *    hundred-hour inspection (UI hides; server also enforces)
 */
import { useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';
import { maintenanceKindLabel } from '@part61/domain';

interface Props {
  aircraftId: string;
  tailNumber: string;
  groundedAt: string | null;
  groundedReason: string | null;
  groundedByItemId: string | null;
  canRequestOverrun: boolean;
}

export function MaintenancePanel({
  aircraftId,
  tailNumber,
  groundedAt,
  groundedReason,
  groundedByItemId,
  canRequestOverrun,
}: Props) {
  const router = useRouter();
  const [overrunOpen, setOverrunOpen] = useState(false);

  const listQ = trpc.admin.maintenance.list.useQuery({ aircraftId });
  const activeQ = trpc.admin.overruns.active.useQuery({ aircraftId });

  const counts = useMemo(() => {
    const c = { current: 0, due_soon: 0, overdue: 0, grounding: 0 };
    for (const r of listQ.data ?? []) {
      const k = (r.status ?? 'current') as keyof typeof c;
      if (k in c) c[k] += 1;
    }
    return c;
  }, [listQ.data]);

  const blockingItem = useMemo(() => {
    if (!groundedByItemId) return null;
    return (listQ.data ?? []).find((r) => r.id === groundedByItemId) ?? null;
  }, [listQ.data, groundedByItemId]);

  const overrunEligible =
    canRequestOverrun &&
    groundedAt !== null &&
    blockingItem?.kind === 'hundred_hour_inspection';

  const activeOverrun = (activeQ.data ?? [])[0] ?? null;

  return (
    <section
      style={{
        marginTop: '1rem',
        padding: '1rem',
        border: '1px solid #ddd',
        borderRadius: 6,
      }}
    >
      <div
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
      >
        <h2 style={{ margin: 0 }}>Maintenance</h2>
        <Link
          href={`/admin/aircraft/${aircraftId}/maintenance`}
          style={{ fontSize: '0.85rem' }}
        >
          View all →
        </Link>
      </div>

      {groundedAt ? (
        <div
          style={{
            marginTop: '0.75rem',
            padding: '0.75rem',
            background: '#7f1d1d',
            color: 'white',
            borderRadius: 4,
            fontWeight: 600,
          }}
        >
          GROUNDED since {new Date(groundedAt).toLocaleString()} —{' '}
          {groundedReason ?? 'reason unknown'}
        </div>
      ) : null}

      {activeOverrun ? (
        <div
          style={{
            marginTop: '0.75rem',
            padding: '0.75rem',
            background: '#fef3c7',
            border: '2px solid #ea580c',
            borderRadius: 4,
            color: '#7c2d12',
          }}
        >
          <strong>§91.409(b) OVERRUN ACTIVE</strong>
          <div style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>
            Up to {activeOverrun.maxAdditionalHours} additional hours authorized to reach
            a place where the 100-hour inspection can be completed. Expires{' '}
            {activeOverrun.expiresAt
              ? new Date(activeOverrun.expiresAt).toLocaleString()
              : 'per grant'}
            .
          </div>
        </div>
      ) : null}

      <div
        style={{
          display: 'flex',
          gap: '1.5rem',
          marginTop: '0.75rem',
          fontSize: '0.9rem',
        }}
      >
        <span>
          <strong style={{ color: '#16a34a' }}>{counts.current}</strong> current
        </span>
        <span>
          <strong style={{ color: '#b45309' }}>{counts.due_soon}</strong> due soon
        </span>
        <span>
          <strong style={{ color: '#dc2626' }}>{counts.overdue}</strong> overdue
        </span>
        <span>
          <strong style={{ color: '#7f1d1d' }}>{counts.grounding}</strong> grounding
        </span>
      </div>

      {overrunEligible && !activeOverrun ? (
        <div style={{ marginTop: '0.75rem' }}>
          <button
            type="button"
            onClick={() => setOverrunOpen(true)}
            style={{
              padding: '0.5rem 1rem',
              background: '#ea580c',
              color: 'white',
              border: 0,
              borderRadius: 4,
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            IA: Request §91.409 overrun
          </button>
        </div>
      ) : null}

      {overrunOpen && blockingItem ? (
        <OverrunModal
          aircraftTail={tailNumber}
          itemId={blockingItem.id}
          itemTitle={blockingItem.title}
          onClose={() => setOverrunOpen(false)}
          onGranted={() => {
            setOverrunOpen(false);
            void activeQ.refetch();
            router.refresh();
          }}
        />
      ) : null}
    </section>
  );
}

function OverrunModal({
  aircraftTail,
  itemId,
  itemTitle,
  onClose,
  onGranted,
}: {
  aircraftTail: string;
  itemId: string;
  itemTitle: string;
  onClose: () => void;
  onGranted: () => void;
}) {
  const grant = trpc.admin.overruns.grant.useMutation();
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const justification = String(fd.get('justification') ?? '').trim();
    const maxAdditionalHours = Number(fd.get('maxAdditionalHours'));
    if (justification.length < 20) {
      setError('Justification must be at least 20 characters.');
      return;
    }
    if (!(maxAdditionalHours >= 1 && maxAdditionalHours <= 10)) {
      setError('Max additional hours must be between 1 and 10.');
      return;
    }
    try {
      await grant.mutateAsync({ itemId, justification, maxAdditionalHours });
      onGranted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Grant failed');
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <form
        onSubmit={onSubmit}
        style={{
          background: 'white',
          padding: '1.5rem',
          borderRadius: 6,
          maxWidth: 560,
          width: '90%',
          border: '3px solid #ea580c',
        }}
      >
        <h2 style={{ margin: 0, color: '#7c2d12' }}>§91.409(b) Overrun Request</h2>
        <div
          style={{
            marginTop: '0.5rem',
            padding: '0.5rem',
            background: '#fef3c7',
            color: '#7c2d12',
            fontSize: '0.85rem',
            borderRadius: 4,
          }}
        >
          <strong>WARNING:</strong> This overrides the airworthiness gate. Granting this
          overrun permits up to 10 additional hours of operation ONLY to reach a place
          where the 100-hour inspection can be completed. Requires IA authority and is
          logged immutably with your IA certificate snapshot.
        </div>

        <p style={{ fontSize: '0.85rem' }}>
          <strong>Aircraft:</strong> {aircraftTail}
          <br />
          <strong>Blocking item:</strong> {maintenanceKindLabel('hundred_hour_inspection')}{' '}
          — {itemTitle}
        </p>

        <label style={{ display: 'block', marginTop: '0.75rem', fontSize: '0.85rem' }}>
          Justification (min 20 chars)
          <textarea
            name="justification"
            required
            minLength={20}
            rows={4}
            style={{ width: '100%', marginTop: '0.25rem' }}
          />
        </label>

        <label style={{ display: 'block', marginTop: '0.5rem', fontSize: '0.85rem' }}>
          Max additional hours (1–10)
          <input
            name="maxAdditionalHours"
            type="number"
            min={1}
            max={10}
            defaultValue={1}
            required
            style={{ width: '100%', marginTop: '0.25rem' }}
          />
        </label>

        {error ? (
          <p style={{ color: 'crimson', fontSize: '0.85rem', marginTop: '0.5rem' }}>
            {error}
          </p>
        ) : null}

        <div
          style={{
            display: 'flex',
            gap: '0.5rem',
            justifyContent: 'flex-end',
            marginTop: '1rem',
          }}
        >
          <button type="button" onClick={onClose} style={{ padding: '0.5rem 1rem' }}>
            Cancel
          </button>
          <button
            type="submit"
            disabled={grant.isPending}
            style={{
              padding: '0.5rem 1rem',
              background: '#ea580c',
              color: 'white',
              border: 0,
              borderRadius: 4,
              fontWeight: 600,
              cursor: grant.isPending ? 'wait' : 'pointer',
            }}
          >
            {grant.isPending ? 'Granting…' : 'Grant overrun (IA sign)'}
          </button>
        </div>
      </form>
    </div>
  );
}
