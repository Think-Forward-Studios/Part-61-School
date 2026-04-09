/**
 * GET /admin/students/[id]/iacra.csv — flat key/value CSV of the IACRA
 * 8710-1 totals for copy/paste into the real form (SYL-11).
 */
import { NextResponse } from 'next/server';
import {
  iacraCsv,
  loadIacraTotals,
  loadIdentification,
  resolveCallerContext,
} from '@/lib/trainingRecord';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteParams = Promise<{ id: string }>;

export async function GET(_req: Request, ctx: { params: RouteParams }) {
  const { id: studentUserId } = await ctx.params;
  const caller = await resolveCallerContext();
  if (!caller) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }
  if (!caller.roles.some((r) => r === 'admin' || r === 'instructor')) {
    return NextResponse.json({ error: 'Admin or instructor role required.' }, { status: 403 });
  }

  const identification = await loadIdentification(studentUserId, caller.schoolId);
  if (!identification) {
    return NextResponse.json({ error: 'Student not found.' }, { status: 404 });
  }
  const totals = await loadIacraTotals(studentUserId, caller.schoolId);
  const csv = iacraCsv(identification, totals);

  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const safeLast = (identification.lastName || identification.fullName || 'student').replace(
    /[^a-zA-Z0-9]/g,
    '',
  );
  const filename = `iacra-hours-${safeLast}-${today}.csv`;

  return new Response(csv, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'private, no-store',
    },
  });
}
