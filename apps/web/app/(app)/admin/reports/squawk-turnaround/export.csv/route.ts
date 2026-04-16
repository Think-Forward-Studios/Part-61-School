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
      a.tail_number,
      coalesce(opened.cnt, 0)::int as opened_in_range,
      coalesce(closed.cnt, 0)::int as closed_in_range,
      coalesce(closed.avg_hours, 0)::numeric as avg_hours_to_resolve
    from public.aircraft a
    left join lateral (
      select count(*) as cnt
      from public.aircraft_squawk s
      where s.aircraft_id = a.id
        and s.deleted_at is null
        and s.opened_at >= ${fromUtc}::timestamptz
        and s.opened_at <= ${toUtc}::timestamptz
    ) opened on true
    left join lateral (
      select
        count(*) as cnt,
        round(avg(extract(epoch from (s.resolved_at - s.opened_at)) / 3600)::numeric, 1) as avg_hours
      from public.aircraft_squawk s
      where s.aircraft_id = a.id
        and s.deleted_at is null
        and s.resolved_at is not null
        and s.resolved_at >= ${fromUtc}::timestamptz
        and s.resolved_at <= ${toUtc}::timestamptz
    ) closed on true
    where a.school_id = ${caller.schoolId}::uuid
      and a.deleted_at is null
    order by a.tail_number
  `)) as unknown as Array<Record<string, unknown>>;

  const header = 'tail_number,opened_in_range,closed_in_range,avg_hours_to_resolve';
  const lines = rows.map((r) => {
    return [
      escapeCsv(String(r.tail_number ?? '')),
      String(r.opened_in_range ?? 0),
      String(r.closed_in_range ?? 0),
      Number(r.avg_hours_to_resolve ?? 0).toFixed(1),
    ].join(',');
  });
  const csv = [header, ...lines].join('\n');

  return new Response(csv, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="squawk-turnaround-${from}-${to}.csv"`,
      'cache-control': 'private, no-store',
    },
  });
}
