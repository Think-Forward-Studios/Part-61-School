export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { db } from '@part61/db';
import { sql } from 'drizzle-orm';
import { resolveCallerContext } from '@/lib/trainingRecord';

function escapeCsv(val: string): string {
  if (/[,"\n\r]/.test(val)) return '"' + val.replace(/"/g, '""') + '"';
  return val;
}

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

  const header = 'course_name,version,enrolled,completed,completion_rate_pct,avg_days_to_complete';
  const lines = rows.map((r) => {
    return [
      escapeCsv(String(r.course_name ?? '')),
      escapeCsv(String(r.version ?? '')),
      String(r.enrolled ?? 0),
      String(r.completed ?? 0),
      Number(r.completion_rate_pct ?? 0).toFixed(1),
      String(r.avg_days_to_complete ?? 0),
    ].join(',');
  });
  const csv = [header, ...lines].join('\n');

  return new Response(csv, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="course-completion-${from}-${to}.csv"`,
      'cache-control': 'private, no-store',
    },
  });
}
