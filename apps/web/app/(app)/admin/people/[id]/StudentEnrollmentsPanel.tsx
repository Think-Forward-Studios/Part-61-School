'use client';

import Link from 'next/link';
import { trpc } from '@/lib/trpc/client';
import * as s from './_panelStyles';
import { NewEnrollmentDialog } from '../../enrollments/NewEnrollmentDialog';

interface EnrollmentRow {
  id: string;
  courseVersionId: string | null;
  courseCode: string | null;
  courseTitle: string | null;
  versionLabel: string | null;
  enrolledAt: string;
  completedAt: string | null;
  withdrawnAt: string | null;
}

/**
 * Courses this user is enrolled in — shown on the admin person
 * detail page, but only for users who carry the 'student' role.
 * Groups into Active / Completed / Withdrawn and exposes a quick-
 * enroll button that pre-fills the student.
 */
export function StudentEnrollmentsPanel({
  userId,
  userDisplayName,
}: {
  userId: string;
  userDisplayName: string;
}) {
  // admin.enrollments.list returns rows pre-joined with course.code,
  // course.title, and course_version.version_label, so we can render
  // 'PPL-ASEL — Private Pilot · v2.0' directly instead of a UUID.
  const listQuery = trpc.admin.enrollments.list.useQuery({ studentUserId: userId });

  const rows = (listQuery.data ?? []) as Array<{
    id: string;
    courseVersionId: string | null;
    courseCode: string | null;
    courseTitle: string | null;
    versionLabel: string | null;
    enrolledAt: string | Date | null;
    completedAt: string | Date | null;
    withdrawnAt: string | Date | null;
  }>;

  const toIso = (v: string | Date | null | undefined): string | null => {
    if (v == null) return null;
    if (v instanceof Date) return v.toISOString();
    return v;
  };

  const mapped: EnrollmentRow[] = rows.map((r) => ({
    id: r.id,
    courseVersionId: r.courseVersionId,
    courseCode: r.courseCode,
    courseTitle: r.courseTitle,
    versionLabel: r.versionLabel,
    enrolledAt: toIso(r.enrolledAt) ?? new Date(0).toISOString(),
    completedAt: toIso(r.completedAt),
    withdrawnAt: toIso(r.withdrawnAt),
  }));

  const active = mapped.filter((e) => !e.completedAt && !e.withdrawnAt);
  const completed = mapped.filter((e) => e.completedAt);
  const withdrawn = mapped.filter((e) => e.withdrawnAt);

  return (
    <section style={s.section}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h2 style={s.heading}>Course Enrollments</h2>
          <p style={{ ...s.listRowMeta, marginTop: '0.3rem' }}>
            {active.length} active · {completed.length} completed · {withdrawn.length} withdrawn
          </p>
        </div>
        <NewEnrollmentDialog
          preselectedStudentId={userId}
          preselectedStudentName={userDisplayName}
          triggerLabel="+ Enroll in a course"
          triggerStyle={smallTrigger}
          onSuccess={() => listQuery.refetch()}
        />
      </header>

      {listQuery.isLoading ? (
        <p style={s.emptyText}>Loading enrollments…</p>
      ) : mapped.length === 0 ? (
        <p style={s.emptyText}>Not enrolled in any course yet.</p>
      ) : (
        <div
          style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}
        >
          {active.length > 0 ? <Group label="Active" tone="active" rows={active} /> : null}
          {completed.length > 0 ? (
            <Group label="Completed" tone="completed" rows={completed} />
          ) : null}
          {withdrawn.length > 0 ? (
            <Group label="Withdrawn" tone="withdrawn" rows={withdrawn} />
          ) : null}
        </div>
      )}
    </section>
  );
}

function Group({
  label,
  tone,
  rows,
}: {
  label: string;
  tone: 'active' | 'completed' | 'withdrawn';
  rows: EnrollmentRow[];
}) {
  const palette =
    tone === 'active'
      ? { fg: '#6ee7b7', bg: 'rgba(52, 211, 153, 0.12)', border: 'rgba(52, 211, 153, 0.4)' }
      : tone === 'completed'
        ? { fg: '#7dd3fc', bg: 'rgba(56, 189, 248, 0.12)', border: 'rgba(56, 189, 248, 0.4)' }
        : { fg: '#cbd5e1', bg: 'rgba(122, 134, 154, 0.12)', border: 'rgba(122, 134, 154, 0.4)' };

  return (
    <div>
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          padding: '0.1rem 0.5rem',
          background: palette.bg,
          color: palette.fg,
          border: `1px solid ${palette.border}`,
          borderRadius: 999,
          fontSize: '0.65rem',
          fontWeight: 700,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          fontFamily: '"JetBrains Mono", ui-monospace, monospace',
          marginBottom: '0.4rem',
        }}
      >
        {label} · {rows.length}
      </div>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {rows.map((r) => (
          <li key={r.id} style={s.listRow}>
            <div style={{ minWidth: 0 }}>
              <div style={{ color: '#f7f9fc', fontWeight: 500 }}>
                {r.courseCode ? (
                  <>
                    <span
                      style={{
                        fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                        color: '#fbbf24',
                        letterSpacing: '0.04em',
                      }}
                    >
                      {r.courseCode}
                    </span>
                    {r.courseTitle ? (
                      <span style={{ color: '#cbd5e1' }}> — {r.courseTitle}</span>
                    ) : null}
                  </>
                ) : (
                  <span style={{ color: '#94a3b8' }}>
                    Course version{' '}
                    <code
                      style={{
                        fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                        color: '#cbd5e1',
                      }}
                    >
                      {r.courseVersionId ? r.courseVersionId.slice(0, 8) : '—'}
                    </code>
                  </span>
                )}
                {r.versionLabel ? (
                  <span style={{ color: '#7a869a', marginLeft: '0.4rem', fontSize: '0.8rem' }}>
                    · {r.versionLabel}
                  </span>
                ) : null}
              </div>
              <div style={s.listRowMeta}>
                Enrolled {new Date(r.enrolledAt).toLocaleDateString()}
                {r.completedAt
                  ? ` · Completed ${new Date(r.completedAt).toLocaleDateString()}`
                  : r.withdrawnAt
                    ? ` · Withdrawn ${new Date(r.withdrawnAt).toLocaleDateString()}`
                    : ''}
              </div>
            </div>
            <Link
              href={`/admin/enrollments/${r.id}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                height: '2rem',
                padding: '0 0.75rem',
                border: '1px solid rgba(56, 189, 248, 0.35)',
                background: 'rgba(56, 189, 248, 0.1)',
                color: '#38bdf8',
                borderRadius: 6,
                fontSize: '0.72rem',
                fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                fontWeight: 600,
                textDecoration: 'none',
                whiteSpace: 'nowrap',
              }}
            >
              Open
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

const smallTrigger: React.CSSProperties = {
  padding: '0.4rem 0.8rem',
  fontSize: '0.72rem',
};
