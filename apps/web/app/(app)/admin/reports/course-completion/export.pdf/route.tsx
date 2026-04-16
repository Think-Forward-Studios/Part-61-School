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

  const rows = (await db.execute(sql`
    select
      coalesce(c.title, 'Unknown') as course_name,
      coalesce(cv.version_label, '-') as version,
      count(*)::int as enrolled,
      count(*) filter (where sce.completed_at is not null)::int as completed,
      case
        when count(*) > 0
        then round(
          count(*) filter (where sce.completed_at is not null)::numeric
          / count(*)::numeric * 100, 1
        )
        else 0
      end as completion_rate_pct,
      coalesce(
        round(avg(
          extract(epoch from (sce.completed_at - sce.enrolled_at)) / 86400
        ) filter (where sce.completed_at is not null), 0),
        0
      )::int as avg_days_to_complete
    from public.student_course_enrollment sce
    left join public.course_version cv on cv.id = sce.course_version_id
    left join public.course c on c.id = cv.course_id
    where sce.school_id = ${caller.schoolId}::uuid
      and sce.deleted_at is null
      and sce.enrolled_at >= ${fromUtc}::timestamptz
      and sce.enrolled_at <= ${toUtc}::timestamptz
    group by c.title, cv.version_label
    order by c.title, cv.version_label
  `)) as unknown as Array<Record<string, unknown>>;

  const pdfRows = rows.map((r) => ({
    courseName: String(r.course_name ?? ''),
    version: String(r.version ?? ''),
    enrolled: String(r.enrolled ?? 0),
    completed: String(r.completed ?? 0),
    completionRatePct: Number(r.completion_rate_pct ?? 0).toFixed(1) + '%',
    avgDaysToComplete: String(r.avg_days_to_complete ?? 0) + 'd',
  }));

  const stream = await renderToStream(
    <ReportPdfShell
      title="Course Completion"
      filtersApplied={`${from} to ${to}`}
      columns={[
        { key: 'courseName', label: 'Course' },
        { key: 'version', label: 'Version' },
        { key: 'enrolled', label: 'Enrolled' },
        { key: 'completed', label: 'Completed' },
        { key: 'completionRatePct', label: 'Completion Rate' },
        { key: 'avgDaysToComplete', label: 'Avg Days' },
      ]}
      rows={pdfRows}
    />,
  );

  return new Response(stream as unknown as ReadableStream, {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="course-completion-${from}-${to}.pdf"`,
      'cache-control': 'private, no-store',
    },
  });
}
