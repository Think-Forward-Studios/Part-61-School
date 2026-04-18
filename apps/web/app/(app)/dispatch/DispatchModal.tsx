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
import { PassengerManifestPanel, type ManifestRow } from './PassengerManifestPanel';

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

  const initialCheckedIn = getDate(reservation, 'student_checked_in_at', 'studentCheckedInAt');
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

  const canDispatch = studentPresent && authorized && allFifAcked && hobbsOk && tachOk;

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

  const sectionHeaderStyle: React.CSSProperties = {
    fontSize: '0.72rem',
    margin: '0 0 0.5rem 0',
    fontFamily: '"JetBrains Mono", ui-monospace, monospace',
    letterSpacing: '0.15em',
    textTransform: 'uppercase',
    color: '#7a869a',
    fontWeight: 500,
  };

  const sectionStyle: React.CSSProperties = {
    marginBottom: '1rem',
    padding: '0.85rem',
    background: '#121826',
    border: '1px solid #1f2940',
    borderRadius: 8,
  };

  const actionButton: React.CSSProperties = {
    padding: '0.4rem 0.85rem',
    background: 'rgba(56, 189, 248, 0.12)',
    color: '#38bdf8',
    border: '1px solid rgba(56, 189, 248, 0.35)',
    borderRadius: 6,
    fontSize: '0.72rem',
    fontFamily: '"JetBrains Mono", ui-monospace, monospace',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    fontWeight: 600,
    cursor: 'pointer',
  };

  const inputStyle: React.CSSProperties = {
    background: '#0d1220',
    border: '1px solid #293352',
    color: '#f7f9fc',
    padding: '0.4rem 0.55rem',
    borderRadius: 6,
    fontFamily: '"JetBrains Mono", ui-monospace, monospace',
    fontSize: '0.82rem',
    marginLeft: '0.4rem',
    width: 110,
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(3, 7, 18, 0.7)',
        backdropFilter: 'blur(4px)',
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
          background: '#0d1220',
          border: '1px solid #1f2940',
          padding: '1.5rem',
          borderRadius: 12,
          maxWidth: 720,
          width: '95%',
          maxHeight: '90vh',
          overflowY: 'auto',
          color: '#cbd5e1',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        }}
      >
        <header
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1rem',
            paddingBottom: '0.75rem',
            borderBottom: '1px solid #1f2940',
          }}
        >
          <div>
            <div
              style={{
                fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                fontSize: '0.65rem',
                letterSpacing: '0.25em',
                textTransform: 'uppercase',
                color: '#5b6784',
                marginBottom: '0.25rem',
              }}
            >
              Operations
            </div>
            <h2 style={{ margin: 0, color: '#f7f9fc', fontSize: '1.1rem' }}>
              Dispatch reservation
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              color: '#7a869a',
              border: '1px solid #1f2940',
              borderRadius: 6,
              padding: '0.25rem 0.6rem',
              cursor: 'pointer',
              fontSize: '0.9rem',
            }}
          >
            ✕
          </button>
        </header>
        {error ? (
          <p
            style={{
              color: '#f87171',
              fontSize: '0.82rem',
              background: 'rgba(248, 113, 113, 0.1)',
              border: '1px solid rgba(248, 113, 113, 0.35)',
              borderRadius: 6,
              padding: '0.5rem 0.75rem',
              marginBottom: '0.75rem',
            }}
          >
            {error}
          </p>
        ) : null}

        <section style={sectionStyle}>
          <h3 style={sectionHeaderStyle}>1. Student check-in</h3>
          {studentPresent ? (
            <p style={{ color: '#34d399', fontSize: '0.85rem', margin: 0 }}>✓ Student is present</p>
          ) : (
            <button
              type="button"
              disabled={markPresent.isPending}
              onClick={() => markPresent.mutate({ reservationId: reservation.id })}
              style={{
                ...actionButton,
                opacity: markPresent.isPending ? 0.5 : 1,
                cursor: markPresent.isPending ? 'not-allowed' : 'pointer',
              }}
            >
              Mark student present
            </button>
          )}
        </section>

        <section style={sectionStyle}>
          <h3 style={sectionHeaderStyle}>2. Instructor authorization</h3>
          {authorized ? (
            <p style={{ color: '#34d399', fontSize: '0.85rem', margin: 0 }}>
              ✓ Instructor authorized release
            </p>
          ) : (
            <button
              type="button"
              disabled={authorize.isPending}
              onClick={() => authorize.mutate({ reservationId: reservation.id })}
              style={{
                ...actionButton,
                opacity: authorize.isPending ? 0.5 : 1,
                cursor: authorize.isPending ? 'not-allowed' : 'pointer',
              }}
            >
              Authorize release
            </button>
          )}
        </section>

        <section style={sectionStyle}>
          <h3 style={sectionHeaderStyle}>3. Flight Information File</h3>
          <FifGate onAllAcked={setAllFifAcked} />
        </section>

        {isFlight ? (
          <>
            <section style={sectionStyle}>
              <h3 style={sectionHeaderStyle}>4. Hobbs / tach out</h3>
              <div style={{ display: 'flex', gap: '1rem', fontSize: '0.82rem' }}>
                <label style={{ color: '#cbd5e1' }}>
                  Hobbs out
                  <input
                    type="number"
                    step="0.1"
                    value={hobbsOut}
                    onChange={(e) => setHobbsOut(e.target.value)}
                    style={inputStyle}
                  />
                </label>
                <label style={{ color: '#cbd5e1' }}>
                  Tach out
                  <input
                    type="number"
                    step="0.1"
                    value={tachOut}
                    onChange={(e) => setTachOut(e.target.value)}
                    style={inputStyle}
                  />
                </label>
              </div>
            </section>

            <section style={sectionStyle}>
              <h3 style={sectionHeaderStyle}>5. Passenger manifest</h3>
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
            paddingTop: '1rem',
            borderTop: '1px solid #1f2940',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '0.45rem 0.9rem',
              background: 'transparent',
              color: '#7a869a',
              border: '1px solid #1f2940',
              borderRadius: 6,
              fontSize: '0.72rem',
              fontFamily: '"JetBrains Mono", ui-monospace, monospace',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canDispatch || dispatchMut.isPending}
            onClick={onSubmit}
            style={{
              padding: '0.5rem 1.1rem',
              background: canDispatch ? 'rgba(251, 191, 36, 0.15)' : 'rgba(122, 134, 154, 0.12)',
              color: canDispatch ? '#fbbf24' : '#5b6784',
              border: `1px solid ${canDispatch ? 'rgba(251, 191, 36, 0.4)' : '#1f2940'}`,
              borderRadius: 6,
              fontSize: '0.74rem',
              fontFamily: '"JetBrains Mono", ui-monospace, monospace',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              fontWeight: 700,
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
