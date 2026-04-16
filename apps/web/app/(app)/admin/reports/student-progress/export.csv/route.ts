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

  void from;
  void to;

  const rows = (await db.execute(sql`
    select
      coalesce(u.full_name, u.email) as name,
      coalesce(c.title, sce.course_descriptor, 'Unknown') as course,
      coalesce(spfc.actual_hours_to_date, 0)::numeric as hours_flown,
      case
        when cv.minimum_hours is not null
          and (cv.minimum_hours ->> 'total')::numeric > 0
        then round(
          coalesce(spfc.actual_hours_to_date, 0)::numeric
          / (cv.minimum_hours ->> 'total')::numeric * 100, 1
        )
        else 0
      end as pct_complete,
      coalesce(
        round(spfc.ahead_behind_hours::numeric * 24 / nullif(
          coalesce(sce.plan_cadence_hours_per_week, cv.default_plan_cadence_hours_per_week, 4)::numeric / 7, 0
        ), 0),
        0
      )::int as ahead_behind_days
    from public.student_course_enrollment sce
    join public.users u on u.id = sce.user_id
    left join public.course_version cv on cv.id = sce.course_version_id
    left join public.course c on c.id = cv.course_id
    left join public.student_progress_forecast_cache spfc
      on spfc.student_enrollment_id = sce.id
    where sce.school_id = ${caller.schoolId}::uuid
      and sce.deleted_at is null
      and sce.completed_at is null
      and sce.withdrawn_at is null
    order by u.full_name, u.email
  `)) as unknown as Array<Record<string, unknown>>;

  const header = 'name,course,pct_complete,hours_flown,ahead_behind_days';
  const lines = rows.map((r) => {
    return [
      escapeCsv(String(r.name ?? '')),
      escapeCsv(String(r.course ?? '')),
      Number(r.pct_complete ?? 0).toFixed(1),
      Number(r.hours_flown ?? 0).toFixed(1),
      String(r.ahead_behind_days ?? 0),
    ].join(',');
  });
  const csv = [header, ...lines].join('\n');

  return new Response(csv, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="student-progress-${from}-${to}.csv"`,
      'cache-control': 'private, no-store',
    },
  });
}
