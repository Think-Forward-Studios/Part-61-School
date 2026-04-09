/**
 * GET /flight-log/iacra.csv — student self-serve IACRA 8710-1 hours CSV.
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

export async function GET() {
  const caller = await resolveCallerContext();
  if (!caller) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }

  const identification = await loadIdentification(caller.userId, caller.schoolId);
  if (!identification) {
    return NextResponse.json({ error: 'Profile not found.' }, { status: 404 });
  }
  const totals = await loadIacraTotals(caller.userId, caller.schoolId);
  const csv = iacraCsv(identification, totals);

  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const safeLast = (identification.lastName || identification.fullName || 'student').replace(
    /[^a-zA-Z0-9]/g,
    '',
  );
  return new Response(csv, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="iacra-hours-${safeLast}-${today}.csv"`,
      'cache-control': 'private, no-store',
    },
  });
}
