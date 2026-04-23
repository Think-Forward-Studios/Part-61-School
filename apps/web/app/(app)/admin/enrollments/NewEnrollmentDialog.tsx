'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';

interface NewEnrollmentDialogProps {
  /**
   * Pre-fill the student when launched from a person's detail page.
   * When set, the student dropdown is hidden and the student can't be
   * changed — the caller is enrolling this specific student.
   */
  preselectedStudentId?: string;
  preselectedStudentName?: string;
  /** Override the trigger button label. */
  triggerLabel?: string;
  /** Override the trigger button style. */
  triggerStyle?: React.CSSProperties;
  /** Called after a successful enrollment; caller decides whether to refresh. */
  onSuccess?: (enrollmentId: string) => void;
}

/**
 * Shared "Enroll a student in a course" dialog.
 *
 * Used in two places:
 *  1. /admin/enrollments page — header action with no preselection.
 *  2. /admin/people/[id] — student enrollments panel, preselects the
 *     student via preselectedStudentId.
 *
 * Posts to admin.enrollments.create. Only *published* course versions
 * are offered (the mutation server-side also refuses draft versions
 * with PRECONDITION_FAILED).
 */
export function NewEnrollmentDialog({
  preselectedStudentId,
  preselectedStudentName,
  triggerLabel = '+ New enrollment',
  triggerStyle,
  onSuccess,
}: NewEnrollmentDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState(preselectedStudentId ?? '');
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [selectedVersionId, setSelectedVersionId] = useState('');
  const [selectedInstructorId, setSelectedInstructorId] = useState('');

  // Lazy-load reference data once the dialog opens — keeps the parent
  // page fast for the far-more-common "just browsing" case.
  const students = trpc.admin.people.list.useQuery(
    { role: 'student', status: 'active', limit: 500, offset: 0 },
    { enabled: open && !preselectedStudentId },
  );
  const instructors = trpc.admin.people.list.useQuery(
    { role: 'instructor', status: 'active', limit: 500, offset: 0 },
    { enabled: open },
  );
  const courses = trpc.admin.courses.list.useQuery(undefined, { enabled: open });
  // Fetch versions only when a course is picked.
  const courseDetail = trpc.admin.courses.get.useQuery(
    { id: selectedCourseId },
    { enabled: open && !!selectedCourseId },
  );

  const create = trpc.admin.enrollments.create.useMutation();

  // When the caller preselects a student, keep selectedStudentId in sync
  // if the prop ever changes.
  useEffect(() => {
    if (preselectedStudentId) setSelectedStudentId(preselectedStudentId);
  }, [preselectedStudentId]);

  // Escape closes.
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
    setSelectedCourseId('');
    setSelectedVersionId('');
    setSelectedInstructorId('');
    if (!preselectedStudentId) setSelectedStudentId('');
  }

  /** Published versions of the selected course, newest first. */
  const availableVersions = useMemo(() => {
    const versions = courseDetail.data?.versions ?? [];
    return versions.filter((v) => v.publishedAt != null);
  }, [courseDetail.data]);

  // Auto-select the newest published version when course changes.
  useEffect(() => {
    if (!selectedCourseId) {
      setSelectedVersionId('');
      return;
    }
    if (availableVersions.length === 0) {
      setSelectedVersionId('');
      return;
    }
    // Pick newest by createdAt if current selection isn't valid.
    const inList = availableVersions.some((v) => v.id === selectedVersionId);
    if (!inList) {
      const newest = [...availableVersions].sort((a, b) => {
        const aT = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bT = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bT - aT;
      })[0];
      setSelectedVersionId(newest?.id ?? '');
    }
  }, [selectedCourseId, availableVersions, selectedVersionId]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const notes = (fd.get('notes') as string)?.trim() || undefined;

    if (!selectedStudentId) {
      setError('Pick a student.');
      return;
    }
    if (!selectedVersionId) {
      setError('Pick a course (and a published version).');
      return;
    }

    try {
      const row = await create.mutateAsync({
        studentUserId: selectedStudentId,
        courseVersionId: selectedVersionId,
        primaryInstructorId: selectedInstructorId || undefined,
        notes,
      });
      closeDialog();
      if (onSuccess && row?.id) onSuccess(row.id);
      else router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Enrollment failed.');
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{ ...triggerPrimary, ...(triggerStyle ?? {}) }}
      >
        {triggerLabel}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Enroll a student in a course"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeDialog();
          }}
          style={overlay}
        >
          <form onSubmit={onSubmit} style={dialogShell}>
            <div>
              <div style={eyebrow}>Training</div>
              <h2 style={{ margin: '0.25rem 0 0', color: '#f7f9fc', fontSize: '1.1rem' }}>
                Enroll in a course
              </h2>
              <p style={dialogSubcopy}>
                Creates a student_course_enrollment against the chosen published course version.
                Draft versions can&apos;t be enrolled — publish them first from{' '}
                <code style={inlineCode}>/admin/courses</code>.
              </p>
            </div>

            {/* Student */}
            {preselectedStudentId ? (
              <Field label="Student">
                <div style={{ ...inputStyle, display: 'flex', alignItems: 'center' }}>
                  {preselectedStudentName ?? '(preselected)'}
                </div>
              </Field>
            ) : (
              <Field label="Student">
                <select
                  value={selectedStudentId}
                  onChange={(e) => setSelectedStudentId(e.target.value)}
                  required
                  style={inputStyle}
                  disabled={students.isLoading}
                >
                  <option value="" disabled>
                    {students.isLoading ? 'Loading students…' : 'Select a student…'}
                  </option>
                  {((students.data?.rows ?? []) as Array<Record<string, unknown>>).map((p) => {
                    const id = String(p.id);
                    const first = (p.first_name as string | null) ?? '';
                    const last = (p.last_name as string | null) ?? '';
                    const email = (p.email as string) ?? '';
                    const name = `${first} ${last}`.trim() || email;
                    return (
                      <option key={id} value={id}>
                        {name} ({email})
                      </option>
                    );
                  })}
                </select>
              </Field>
            )}

            {/* Course */}
            <Field label="Course">
              <select
                value={selectedCourseId}
                onChange={(e) => setSelectedCourseId(e.target.value)}
                required
                style={inputStyle}
                disabled={courses.isLoading}
              >
                <option value="" disabled>
                  {courses.isLoading ? 'Loading courses…' : 'Select a course…'}
                </option>
                {(courses.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} — {c.title}
                  </option>
                ))}
              </select>
            </Field>

            {/* Version — only after course is chosen */}
            {selectedCourseId ? (
              <Field
                label="Version"
                hint={
                  availableVersions.length === 0 && !courseDetail.isLoading
                    ? 'This course has no published version yet.'
                    : undefined
                }
              >
                <select
                  value={selectedVersionId}
                  onChange={(e) => setSelectedVersionId(e.target.value)}
                  required
                  style={inputStyle}
                  disabled={courseDetail.isLoading || availableVersions.length === 0}
                >
                  {availableVersions.length === 0 ? (
                    <option value="" disabled>
                      {courseDetail.isLoading ? 'Loading versions…' : 'No published versions'}
                    </option>
                  ) : null}
                  {availableVersions.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.versionLabel ?? v.id.slice(0, 8)}
                      {v.publishedAt
                        ? ` · published ${new Date(v.publishedAt).toLocaleDateString()}`
                        : ''}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}

            {/* Primary instructor (optional) */}
            <Field
              label="Primary instructor"
              hint="Optional. Assigns the CFI who owns this student's progression."
            >
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
            </Field>

            <Field label="Notes">
              <textarea
                name="notes"
                rows={2}
                maxLength={1000}
                placeholder="Optional enrollment notes"
                style={{
                  ...inputStyle,
                  height: 'auto',
                  padding: '0.55rem 0.75rem',
                  minHeight: '3rem',
                  resize: 'vertical',
                  fontFamily: 'inherit',
                }}
              />
            </Field>

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
              <button type="submit" style={primaryButton} disabled={create.isPending}>
                {create.isPending ? 'Enrolling…' : 'Enroll student'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
      <label style={labelStyle}>{label}</label>
      {children}
      {hint ? <span style={{ fontSize: '0.72rem', color: '#7a869a' }}>{hint}</span> : null}
    </div>
  );
}

// --- styles --------------------------------------------------------------

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
  maxWidth: 560,
  background: '#0d1220',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 14,
  padding: '1.25rem 1.35rem',
  boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem',
  maxHeight: '92vh',
  overflowY: 'auto',
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

const inlineCode: React.CSSProperties = {
  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
  fontSize: '0.78rem',
  padding: '0.02rem 0.3rem',
  background: 'rgba(255,255,255,0.06)',
  borderRadius: 4,
  color: '#cbd5e1',
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

const triggerPrimary: React.CSSProperties = {
  padding: '0.55rem 0.95rem',
  background: 'linear-gradient(180deg, #fbbf24 0%, #f59e0b 100%)',
  color: '#0a0e1a',
  borderRadius: 8,
  border: 'none',
  textDecoration: 'none',
  fontSize: '0.78rem',
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  boxShadow: '0 4px 14px rgba(251, 191, 36, 0.25), 0 1px 0 rgba(255, 255, 255, 0.15) inset',
  cursor: 'pointer',
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
