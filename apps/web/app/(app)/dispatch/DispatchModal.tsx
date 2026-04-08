'use client';

/**
 * DispatchModal (FTR-02, FTR-03, FTR-06, FTR-07).
 *
 * Multi-step gate that walks the dispatcher through:
 *   1. Student check-in (mark present if not self-checked-in)
 *   2. Instructor authorization (records instructor_authorized_at)
 *   3. FIF acknowledgements (block until 0 unread)
 *   4. Hobbs / tach out capture (flight only)
 *   5. Passenger manifest (flight only — PIC seeded from instructor/student)
 *   6. Submit → dispatch.dispatchReservation
 *
 * The "Dispatch" button only enables when every gate is satisfied.
 * Banned-term note: button labels use "Confirm", "Authorize",
 * "Acknowledge", "Dispatch" — not the banned word.
 */
import { useEffect, useState } from 'react';
import { trpc } from '@/lib/trpc/client';
import { FifGate } from './FifGate';
import {
  PassengerManifestPanel,
  type ManifestRow,
} from './PassengerManifestPanel';

type Reservation = Record<string, unknown> & { id: string; status: string };

function getStr(r: Reservation, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = r[k];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return null;
}

function getDate(r: Reservation, ...keys: string[]): Date | null {
  for (const k of keys) {
    const v = r[k];
    if (typeof v === 'string') {
      const d = new Date(v);
      if (!isNaN(d.getTime())) return d;
    }
  }
  return null;
}

export function DispatchModal({
  reservation,
  onClose,
  onDispatched,
}: {
  reservation: Reservation;
  onClose: () => void;
  onDispatched: () => void;
}) {
  const activity = getStr(reservation, 'activity_type', 'activityType') ?? 'misc';
  const isFlight = activity === 'flight';

  const initialCheckedIn = getDate(
    reservation,
    'student_checked_in_at',
    'studentCheckedInAt',
  );
  const initialAuthorized = getDate(
    reservation,
    'instructor_authorized_at',
    'instructorAuthorizedAt',
  );

  const [studentPresent, setStudentPresent] = useState(initialCheckedIn != null);
  const [authorized, setAuthorized] = useState(initialAuthorized != null);
  const [allFifAcked, setAllFifAcked] = useState(false);
  const [hobbsOut, setHobbsOut] = useState('');
  const [tachOut, setTachOut] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Seed manifest with PIC/SIC from reservation.
  const studentId = getStr(reservation, 'student_id', 'studentId');
  const instructorId = getStr(reservation, 'instructor_id', 'instructorId');
  const [manifest, setManifest] = useState<ManifestRow[]>(() => {
    const seed: ManifestRow[] = [];
    if (instructorId) {
      seed.push({
        position: 'pic',
        name: 'Instructor',
        weightLbs: null,
        emergencyContactName: null,
        emergencyContactPhone: null,
        notes: null,
      });
    }
    if (studentId) {
      seed.push({
        position: instructorId ? 'sic' : 'pic',
        name: 'Student',
        weightLbs: null,
        emergencyContactName: null,
        emergencyContactPhone: null,
        notes: null,
      });
    }
    return seed;
  });

  const markPresent = trpc.dispatch.markStudentPresent.useMutation({
    onSuccess: () => setStudentPresent(true),
    onError: (e) => setError(e.message),
  });
  const authorize = trpc.dispatch.authorizeRelease.useMutation({
    onSuccess: () => setAuthorized(true),
    onError: (e) => setError(e.message),
  });
  const upsertManifest = trpc.dispatch.passengerManifestUpsert.useMutation();
  const dispatchMut = trpc.dispatch.dispatchReservation.useMutation({
    onSuccess: () => onDispatched(),
    onError: (e) => setError(e.message),
  });

  const hobbsOutNum = isFlight ? Number(hobbsOut) : 0;
  const tachOutNum = isFlight ? Number(tachOut) : 0;
  const hobbsOk = !isFlight || (hobbsOut !== '' && !isNaN(hobbsOutNum));
  const tachOk = !isFlight || (tachOut !== '' && !isNaN(tachOutNum));

  const canDispatch =
    studentPresent && authorized && allFifAcked && hobbsOk && tachOk;

  async function onSubmit() {
    setError(null);
    try {
      if (isFlight && manifest.length > 0) {
        await upsertManifest.mutateAsync({
          reservationId: reservation.id,
          rows: manifest.map((r) => ({
            position: r.position,
            name: r.name,
            weightLbs: r.weightLbs,
            emergencyContactName: r.emergencyContactName,
            emergencyContactPhone: r.emergencyContactPhone,
            notes: r.notes,
          })),
        });
      }
      await dispatchMut.mutateAsync({
        reservationId: reservation.id,
        hobbsOut: isFlight ? hobbsOutNum : null,
        tachOut: isFlight ? tachOutNum : null,
      });
    } catch {
      /* surfaced via mutation onError */
    }
  }

  // Close on escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'white',
          padding: '1.25rem',
          borderRadius: 8,
          maxWidth: 720,
          width: '95%',
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
      >
        <header
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '0.75rem',
          }}
        >
          <h2 style={{ margin: 0 }}>Dispatch reservation</h2>
          <button type="button" onClick={onClose}>
            ✕
          </button>
        </header>
        {error ? (
          <p style={{ color: 'crimson', fontSize: '0.85rem' }}>{error}</p>
        ) : null}

        <section style={{ marginBottom: '0.75rem' }}>
          <h3 style={{ fontSize: '0.95rem', margin: '0 0 0.25rem 0' }}>
            1. Student check-in
          </h3>
          {studentPresent ? (
            <p style={{ color: '#16a34a', fontSize: '0.85rem' }}>
              ✓ Student is present
            </p>
          ) : (
            <button
              type="button"
              disabled={markPresent.isPending}
              onClick={() =>
                markPresent.mutate({ reservationId: reservation.id })
              }
            >
              Mark student present
            </button>
          )}
        </section>

        <section style={{ marginBottom: '0.75rem' }}>
          <h3 style={{ fontSize: '0.95rem', margin: '0 0 0.25rem 0' }}>
            2. Instructor authorization
          </h3>
          {authorized ? (
            <p style={{ color: '#16a34a', fontSize: '0.85rem' }}>
              ✓ Instructor authorized release
            </p>
          ) : (
            <button
              type="button"
              disabled={authorize.isPending}
              onClick={() =>
                authorize.mutate({ reservationId: reservation.id })
              }
            >
              Authorize release
            </button>
          )}
        </section>

        <section style={{ marginBottom: '0.75rem' }}>
          <h3 style={{ fontSize: '0.95rem', margin: '0 0 0.25rem 0' }}>
            3. Flight Information File
          </h3>
          <FifGate onAllAcked={setAllFifAcked} />
        </section>

        {isFlight ? (
          <>
            <section style={{ marginBottom: '0.75rem' }}>
              <h3 style={{ fontSize: '0.95rem', margin: '0 0 0.25rem 0' }}>
                4. Hobbs / tach out
              </h3>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <label>
                  Hobbs out{' '}
                  <input
                    type="number"
                    step="0.1"
                    value={hobbsOut}
                    onChange={(e) => setHobbsOut(e.target.value)}
                  />
                </label>
                <label>
                  Tach out{' '}
                  <input
                    type="number"
                    step="0.1"
                    value={tachOut}
                    onChange={(e) => setTachOut(e.target.value)}
                  />
                </label>
              </div>
            </section>

            <section style={{ marginBottom: '0.75rem' }}>
              <h3 style={{ fontSize: '0.95rem', margin: '0 0 0.25rem 0' }}>
                5. Passenger manifest
              </h3>
              <PassengerManifestPanel rows={manifest} onChange={setManifest} />
            </section>
          </>
        ) : null}

        <footer
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '0.5rem',
            marginTop: '1rem',
          }}
        >
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            disabled={!canDispatch || dispatchMut.isPending}
            onClick={onSubmit}
            style={{
              padding: '0.5rem 1rem',
              background: canDispatch ? '#0070f3' : '#9ca3af',
              color: 'white',
              border: 0,
              borderRadius: 4,
              cursor: canDispatch ? 'pointer' : 'not-allowed',
            }}
          >
            {dispatchMut.isPending ? 'Dispatching…' : 'Dispatch'}
          </button>
        </footer>
      </div>
    </div>
  );
}
