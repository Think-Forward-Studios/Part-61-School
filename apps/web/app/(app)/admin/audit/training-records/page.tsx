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
import { PageHeader } from '@/components/ui';
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

const TH: React.CSSProperties = {
  textAlign: 'left',
  padding: '0.65rem 0.9rem',
  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
  fontSize: '0.68rem',
  letterSpacing: '0.15em',
  color: '#7a869a',
  textTransform: 'uppercase',
  fontWeight: 500,
  borderBottom: '1px solid #1f2940',
};

const TD: React.CSSProperties = {
  padding: '0.7rem 0.9rem',
  color: '#cbd5e1',
  fontSize: '0.82rem',
};

function severityBadge(severity: string): { bg: string; fg: string; border: string } {
  if (severity === 'critical')
    return {
      bg: 'rgba(248, 113, 113, 0.14)',
      fg: '#f87171',
      border: 'rgba(248, 113, 113, 0.35)',
    };
  if (severity === 'warn')
    return {
      bg: 'rgba(251, 191, 36, 0.12)',
      fg: '#fbbf24',
      border: 'rgba(251, 191, 36, 0.35)',
    };
  return {
    bg: 'rgba(122, 134, 154, 0.14)',
    fg: '#7a869a',
    border: 'rgba(122, 134, 154, 0.35)',
  };
}

function fmtDate(s: string | null): string {
  if (!s) return '—';
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
    <main style={{ padding: '0 1.5rem 2rem', maxWidth: 1200, margin: '0 auto' }}>
      <PageHeader
        eyebrow="Audit"
        title="Training record audit"
        subtitle="Open training-record exceptions from the nightly 07:00 UTC audit run."
        actions={<AuditActions />}
      />

      <div
        style={{
          display: 'flex',
          gap: '0.75rem',
          margin: '0 0 1rem',
          fontSize: '0.78rem',
          flexWrap: 'wrap',
          fontFamily: '"JetBrains Mono", ui-monospace, monospace',
        }}
      >
        <MetricChip label="All" value={rows.length} hue="#7a869a" />
        <MetricChip label="Critical" value={criticalCount} hue="#f87171" />
        <MetricChip label="Warning" value={warnCount} hue="#fbbf24" />
        <MetricChip label="Info" value={infoCount} hue="#7a869a" />
      </div>

      {rows.length === 0 ? (
        <div
          style={{
            padding: '3rem 1rem',
            textAlign: 'center',
            color: '#34d399',
            fontSize: '0.95rem',
            background: '#0d1220',
            border: '1px dashed rgba(52, 211, 153, 0.35)',
            borderRadius: 12,
          }}
        >
          No open training record exceptions. Nightly audit runs daily at 07:00 UTC.
        </div>
      ) : (
        <div
          style={{
            background: '#0d1220',
            border: '1px solid #1f2940',
            borderRadius: 12,
            overflow: 'hidden',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ background: '#121826' }}>
                <th style={TH}>Severity</th>
                <th style={TH}>Student</th>
                <th style={TH}>Kind</th>
                <th style={TH}>First detected</th>
                <th style={TH}>Last detected</th>
                <th style={TH}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const badge = severityBadge(r.severity);
                return (
                  <tr key={r.id} style={{ borderBottom: '1px solid #161d30' }}>
                    <td style={TD}>
                      <span
                        style={{
                          display: 'inline-flex',
                          padding: '0.18rem 0.55rem',
                          borderRadius: 999,
                          background: badge.bg,
                          color: badge.fg,
                          border: `1px solid ${badge.border}`,
                          fontSize: '0.68rem',
                          fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                          letterSpacing: '0.1em',
                          textTransform: 'uppercase',
                          fontWeight: 600,
                        }}
                      >
                        {auditExceptionSeverityLabel(r.severity).toUpperCase()}
                      </span>
                    </td>
                    <td style={TD}>
                      {r.student_user_id ? (
                        <Link
                          href={`/admin/people/${r.student_user_id}`}
                          style={{ color: '#f7f9fc', textDecoration: 'none', fontWeight: 500 }}
                        >
                          {r.student_name ?? 'Unknown'}
                        </Link>
                      ) : (
                        (r.student_name ?? 'Unknown')
                      )}
                    </td>
                    <td style={TD}>{auditExceptionKindLabel(r.kind)}</td>
                    <td
                      style={{
                        ...TD,
                        fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                        fontSize: '0.76rem',
                      }}
                    >
                      {fmtDate(r.first_detected_at)}
                    </td>
                    <td
                      style={{
                        ...TD,
                        fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                        fontSize: '0.76rem',
                      }}
                    >
                      {fmtDate(r.last_detected_at)}
                    </td>
                    <td style={TD}>
                      <AuditActions exceptionId={r.id} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

function MetricChip({ label, value, hue }: { label: string; value: number; hue: string }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.4rem',
        padding: '0.3rem 0.7rem',
        borderRadius: 6,
        background: `${hue}14`,
        color: hue,
        border: `1px solid ${hue}44`,
        fontSize: '0.72rem',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        fontWeight: 500,
      }}
    >
      <span>{label}</span>
      <strong style={{ color: hue, fontWeight: 700 }}>{value}</strong>
    </span>
  );
}
