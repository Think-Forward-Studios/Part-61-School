'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';

interface ReassignInstructorDialogProps {
  enrollmentId: string;
  currentInstructorId: string | null;
  currentInstructorName: string | null;
  studentName: string | null;
}

/**
 * Change the primary instructor on an existing enrollment.
 *
 * Calls admin.enrollments.reassignPrimaryInstructor with the picked
 * instructor (or null to clear). The page is a server component, so on
 * success we call router.refresh() — the trpc list query equivalent —
 * to re-fetch the enrollments table.
 */
export function ReassignInstructorDialog({
  enrollmentId,
  currentInstructorId,
  currentInstructorName,
  studentName,
}: ReassignInstructorDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedInstructorId, setSelectedInstructorId] = useState<string>(
    currentInstructorId ?? '',
  );

  const instructors = trpc.admin.people.list.useQuery(
    { role: 'instructor', status: 'active', limit: 500, offset: 0 },
    { enabled: open },
  );

  const reassign = trpc.admin.enrollments.reassignPrimaryInstructor.useMutation();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDialog();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  function closeDialog() {
    setOpen(false);
    setError(null);
    setSelectedInstructorId(currentInstructorId ?? '');
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const newId = selectedInstructorId || null;
    if (newId === (currentInstructorId ?? null)) {
      closeDialog();
      return;
    }

    try {
      await reassign.mutateAsync({
        enrollmentId,
        newPrimaryInstructorId: newId,
      });
      closeDialog();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reassign failed.');
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={triggerStyle}
        title="Reassign primary instructor"
      >
        Reassign…
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Reassign primary instructor"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeDialog();
          }}
          style={overlay}
        >
          <form onSubmit={onSubmit} style={dialogShell}>
            <div>
              <div style={eyebrow}>Enrollment</div>
              <h2 style={{ margin: '0.25rem 0 0', color: '#f7f9fc', fontSize: '1.1rem' }}>
                Reassign primary instructor
              </h2>
              <p style={dialogSubcopy}>
                {studentName ? (
                  <>
                    Student: <strong style={{ color: '#e2e8f0' }}>{studentName}</strong>
                    <br />
                  </>
                ) : null}
                Current:{' '}
                <strong style={{ color: '#e2e8f0' }}>{currentInstructorName ?? '— None —'}</strong>
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              <label style={labelStyle}>New primary instructor</label>
              <select
                value={selectedInstructorId}
                onChange={(e) => setSelectedInstructorId(e.target.value)}
                style={inputStyle}
                disabled={instructors.isLoading}
              >
                <option value="">— None —</option>
                {((instructors.data?.rows ?? []) as Array<Record<string, unknown>>).map((p) => {
                  const id = String(p.id);
                  const first = (p.first_name as string | null) ?? '';
                  const last = (p.last_name as string | null) ?? '';
                  const email = (p.email as string) ?? '';
                  const name = `${first} ${last}`.trim() || email;
                  return (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  );
                })}
              </select>
            </div>

            {error ? <div style={{ color: '#f87171', fontSize: '0.82rem' }}>{error}</div> : null}

            <div
              style={{
                display: 'flex',
                gap: '0.5rem',
                justifyContent: 'flex-end',
                alignItems: 'center',
                marginTop: '0.25rem',
              }}
            >
              <button type="button" onClick={closeDialog} style={ghostButton}>
                Cancel
              </button>
              <button type="submit" style={primaryButton} disabled={reassign.isPending}>
                {reassign.isPending ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}

const triggerStyle: React.CSSProperties = {
  display: 'inline-block',
  padding: '0.25rem 0.6rem',
  background: 'transparent',
  border: '1px solid rgba(255,255,255,0.18)',
  borderRadius: 6,
  color: '#cbd5e1',
  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
  fontSize: '0.68rem',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  fontWeight: 600,
  cursor: 'pointer',
};

const overlay: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(4, 8, 18, 0.72)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 50,
  backdropFilter: 'blur(3px)',
};

const dialogShell: React.CSSProperties = {
  width: '100%',
  maxWidth: 480,
  background: '#0d1220',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 14,
  padding: '1.25rem 1.35rem',
  boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem',
};

const eyebrow: React.CSSProperties = {
  fontSize: '0.66rem',
  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  color: '#7a869a',
  fontWeight: 600,
};

const dialogSubcopy: React.CSSProperties = {
  margin: '0.3rem 0 0',
  fontSize: '0.82rem',
  color: '#94a3b8',
  lineHeight: 1.45,
};

const labelStyle: React.CSSProperties = {
  fontSize: '0.68rem',
  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: '#7a869a',
  fontWeight: 600,
};

const inputStyle: React.CSSProperties = {
  height: '2.3rem',
  background: 'rgba(9, 13, 24, 0.85)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 8,
  color: '#e2e8f0',
  padding: '0 0.75rem',
  fontSize: '0.88rem',
  outline: 'none',
  width: '100%',
};

const primaryButton: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  height: '2.3rem',
  padding: '0 1rem',
  background: 'linear-gradient(135deg, #fbbf24, #f59e0b)',
  color: '#0a0e1a',
  border: 'none',
  borderRadius: 8,
  fontSize: '0.88rem',
  fontWeight: 700,
  cursor: 'pointer',
  letterSpacing: '0.01em',
};

const ghostButton: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  height: '2.3rem',
  padding: '0 1rem',
  background: 'transparent',
  border: '1px solid rgba(255,255,255,0.14)',
  borderRadius: 8,
  color: '#cbd5e1',
  fontSize: '0.82rem',
  fontWeight: 600,
  cursor: 'pointer',
};
