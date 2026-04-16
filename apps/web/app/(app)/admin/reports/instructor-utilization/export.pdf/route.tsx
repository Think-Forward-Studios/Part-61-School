export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { renderToStream } from '@react-pdf/renderer';
import { db } from '@part61/db';
import { sql } from 'drizzle-orm';
import { resolveCallerContext } from '@/lib/trainingRecord';
import { ReportPdfShell } from '../../_pdfs/ReportPdfShell';

export async function GET(req: Request) {
  const caller = await resolveCallerContext();
  if (!caller || caller.activeRole !== 'admin') {
    return new Response('Forbidden', { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const from =
    searchParams.get('from') ?? new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const to = searchParams.get('to') ?? new Date().toISOString().slice(0, 10);
  const fromUtc = from + 'T00:00:00Z';
  const toUtc = to + 'T23:59:59.999Z';

  // allow-banned-term: internal Postgres enum literal
  const rows = (await db.execute(sql`
    select
      u.id as user_id,
      coalesce(u.full_name, u.email) as name,
      u.email,
      coalesce((
        select sum(extract(epoch from (upper(r.time_range) - lower(r.time_range))) / 3600)
        from public.reservation r
        where r.instructor_id = u.id
          and r.deleted_at is null
          and r.status in ('approved', 'dispatched', 'flown', 'closed')
          and lower(r.time_range) >= ${fromUtc}::timestamptz
          and lower(r.time_range) <= ${toUtc}::timestamptz
      ), 0)::numeric as scheduled_hours,
      coalesce((
        select sum(extract(epoch from (upper(r.time_range) - lower(r.time_range))) / 3600)
        from public.reservation r
        where r.instructor_id = u.id
          and r.deleted_at is null
          and r.status in ('flown', 'closed')
          and lower(r.time_range) >= ${fromUtc}::timestamptz
          and lower(r.time_range) <= ${toUtc}::timestamptz
      ), 0)::numeric as flown_hours,
      coalesce((
        select round(
          count(*) filter (where sc.status = 'passed')::numeric
          / nullif(count(*)::numeric, 0) * 100, 1
        )
        from public.stage_check sc
        where sc.checker_user_id = u.id
          and sc.deleted_at is null
          and sc.sealed_at is not null
          and sc.conducted_at >= ${fromUtc}::timestamptz
          and sc.conducted_at <= ${toUtc}::timestamptz
      ), 0)::numeric as pass_rate,
      coalesce((
        select count(*)
        from public.notification n
        where n.recipient_user_id = u.id
          and n.event_kind like 'duty_%'
          and n.created_at >= ${fromUtc}::timestamptz
          and n.created_at <= ${toUtc}::timestamptz
      ), 0)::int as workload_warnings,
      0::int as duty_violations
    from public.users u
    join public.user_roles ur on ur.user_id = u.id and ur.role = 'instructor'
    where u.school_id = ${caller.schoolId}::uuid
      and u.deleted_at is null
    order by u.full_name, u.email
  `)) as unknown as Array<Record<string, unknown>>;

  const pdfRows = rows.map((r) => ({
    name: String(r.name ?? ''),
    email: String(r.email ?? ''),
    scheduledHours: Number(r.scheduled_hours ?? 0).toFixed(1),
    flownHours: Number(r.flown_hours ?? 0).toFixed(1),
    passRate: Number(r.pass_rate ?? 0).toFixed(1) + '%',
    workloadWarnings: String(r.workload_warnings ?? 0),
    dutyViolations: String(r.duty_violations ?? 0),
  }));

  const stream = await renderToStream(
    <ReportPdfShell
      title="Instructor Utilization"
      filtersApplied={`${from} to ${to}`}
      columns={[
        { key: 'name', label: 'Name' },
        { key: 'email', label: 'Email' },
        { key: 'scheduledHours', label: 'Scheduled Hours' },
        { key: 'flownHours', label: 'Flown Hours' },
        { key: 'passRate', label: 'Pass Rate' },
        { key: 'workloadWarnings', label: 'Warnings' },
        { key: 'dutyViolations', label: 'Duty Violations' },
      ]}
      rows={pdfRows}
    />,
  );

  return new Response(stream as unknown as ReadableStream, {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="instructor-utilization-${from}-${to}.pdf"`,
      'cache-control': 'private, no-store',
    },
  });
}
