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
      coalesce(u.full_name, u.email) as name,
      coalesce(ns_cnt.no_shows, 0)::int as no_shows,
      coalesce(res_cnt.total_reservations, 0)::int as total_reservations,
      case
        when coalesce(res_cnt.total_reservations, 0) > 0
        then round(
          coalesce(ns_cnt.no_shows, 0)::numeric
          / res_cnt.total_reservations::numeric * 100, 1
        )
        else 0
      end as no_show_rate_pct
    from public.users u
    join public.user_roles ur on ur.user_id = u.id and ur.role = 'student'
    left join lateral (
      select count(*) as no_shows
      from public.no_show ns
      where ns.user_id = u.id
        and ns.school_id = ${caller.schoolId}::uuid
        and ns.scheduled_at >= ${fromUtc}::timestamptz
        and ns.scheduled_at <= ${toUtc}::timestamptz
    ) ns_cnt on true
    left join lateral (
      select count(*) as total_reservations
      from public.reservation r
      where r.student_id = u.id
        and r.deleted_at is null
        and r.school_id = ${caller.schoolId}::uuid
        and lower(r.time_range) >= ${fromUtc}::timestamptz
        and lower(r.time_range) <= ${toUtc}::timestamptz
    ) res_cnt on true
    where u.school_id = ${caller.schoolId}::uuid
      and u.deleted_at is null
    order by no_show_rate_pct desc, u.full_name
  `)) as unknown as Array<Record<string, unknown>>;

  const pdfRows = rows.map((r) => ({
    name: String(r.name ?? ''),
    noShows: String(r.no_shows ?? 0),
    totalReservations: String(r.total_reservations ?? 0),
    noShowRatePct: Number(r.no_show_rate_pct ?? 0).toFixed(1) + '%',
  }));

  const stream = await renderToStream(
    <ReportPdfShell
      title="No-Show Rate"
      filtersApplied={`${from} to ${to}`}
      columns={[
        { key: 'name', label: 'Student' },
        { key: 'noShows', label: 'No-Shows' },
        { key: 'totalReservations', label: 'Total Reservations' },
        { key: 'noShowRatePct', label: 'No-Show Rate' },
      ]}
      rows={pdfRows}
    />,
  );

  return new Response(stream as unknown as ReadableStream, {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="no-show-rate-${from}-${to}.pdf"`,
      'cache-control': 'private, no-store',
    },
  });
}
