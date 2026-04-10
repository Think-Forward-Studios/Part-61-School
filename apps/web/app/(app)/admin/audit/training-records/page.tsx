/**
 * /admin/audit/training-records — exception dashboard (SYL-24).
 *
 * Server component that renders open training record audit exceptions
 * grouped by severity. Admin can mark items resolved or trigger a
 * manual audit run.
 */
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { eq, sql } from 'drizzle-orm';
import { db, users } from '@part61/db';
import { auditExceptionKindLabel, auditExceptionSeverityLabel } from '@part61/domain';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { AuditActions } from './AuditActions';

export const dynamic = 'force-dynamic';

type ExceptionRow = {
  id: string;
  student_enrollment_id: string;
  student_user_id: string | null;
  student_name: string | null;
  kind: string;
  severity: string;
  details: unknown;
  first_detected_at: string;
  last_detected_at: string;
};

function severityBadge(severity: string): { bg: string; fg: string } {
  if (severity === 'critical') return { bg: '#dc2626', fg: 'white' };
  if (severity === 'warn') return { bg: '#eab308', fg: '#1f2937' };
  return { bg: '#e5e7eb', fg: '#374151' };
}

function fmtDate(s: string | null): string {
  if (!s) return '--';
  return new Date(s).toLocaleDateString();
}

export default async function AuditTrainingRecordsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const me = (await db.select().from(users).where(eq(users.id, user.id)).limit(1))[0];
  if (!me?.schoolId) redirect('/login');

  const rows = (await db.execute(sql`
    select
      e.id,
      e.student_enrollment_id,
      sce.user_id as student_user_id,
      stu.full_name as student_name,
      e.kind::text as kind,
      e.severity::text as severity,
      e.details,
      e.first_detected_at::text as first_detected_at,
      e.last_detected_at::text as last_detected_at
    from public.training_record_audit_exception e
    left join public.student_course_enrollment sce on sce.id = e.student_enrollment_id
    left join public.users stu on stu.id = sce.user_id
    where e.school_id = ${me.schoolId}::uuid
      and e.resolved_at is null
    order by
      case e.severity
        when 'critical' then 0
        when 'warn' then 1
        else 2
      end,
      e.last_detected_at desc
    limit 500
  `)) as unknown as ExceptionRow[];

  const criticalCount = rows.filter((r) => r.severity === 'critical').length;
  const warnCount = rows.filter((r) => r.severity === 'warn').length;
  const infoCount = rows.filter((r) => r.severity === 'info').length;

  return (
    <main style={{ padding: '1rem', maxWidth: 1200 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Training record audit</h1>
        <AuditActions />
      </header>

      <div style={{ display: 'flex', gap: '1rem', margin: '0.75rem 0', fontSize: '0.85rem' }}>
        <span>
          All: <strong>{rows.length}</strong>
        </span>
        <span style={{ color: '#dc2626' }}>
          Critical: <strong>{criticalCount}</strong>
        </span>
        <span style={{ color: '#b45309' }}>
          Warning: <strong>{warnCount}</strong>
        </span>
        <span style={{ color: '#6b7280' }}>
          Info: <strong>{infoCount}</strong>
        </span>
      </div>

      {rows.length === 0 ? (
        <p style={{ color: '#16a34a', fontSize: '1rem', marginTop: '2rem' }}>
          No open training record exceptions. Nightly audit runs daily at 07:00 UTC.
        </p>
      ) : (
        <table
          style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}
        >
          <thead>
            <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
              <th style={{ padding: '0.4rem' }}>Severity</th>
              <th style={{ padding: '0.4rem' }}>Student</th>
              <th style={{ padding: '0.4rem' }}>Kind</th>
              <th style={{ padding: '0.4rem' }}>First detected</th>
              <th style={{ padding: '0.4rem' }}>Last detected</th>
              <th style={{ padding: '0.4rem' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const badge = severityBadge(r.severity);
              return (
                <tr key={r.id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '0.4rem' }}>
                    <span
                      style={{
                        background: badge.bg,
                        color: badge.fg,
                        padding: '0.1rem 0.4rem',
                        borderRadius: 3,
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        letterSpacing: '0.03em',
                      }}
                    >
                      {auditExceptionSeverityLabel(r.severity).toUpperCase()}
                    </span>
                  </td>
                  <td style={{ padding: '0.4rem' }}>
                    {r.student_user_id ? (
                      <Link href={`/admin/people/${r.student_user_id}`}>
                        {r.student_name ?? 'Unknown'}
                      </Link>
                    ) : (
                      r.student_name ?? 'Unknown'
                    )}
                  </td>
                  <td style={{ padding: '0.4rem' }}>{auditExceptionKindLabel(r.kind)}</td>
                  <td style={{ padding: '0.4rem' }}>{fmtDate(r.first_detected_at)}</td>
                  <td style={{ padding: '0.4rem' }}>{fmtDate(r.last_detected_at)}</td>
                  <td style={{ padding: '0.4rem' }}>
                    <AuditActions exceptionId={r.id} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </main>
  );
}
