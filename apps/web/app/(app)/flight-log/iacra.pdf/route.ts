/**
 * GET /flight-log/iacra.pdf — student self-serve IACRA 8710-1 hours PDF.
 * Scoped to the caller's own user_id.
 */
import { NextResponse } from 'next/server';
import { renderToStream } from '@react-pdf/renderer';
import {
  loadIacraTotals,
  loadIdentification,
  loadSchoolName,
  resolveCallerContext,
} from '@/lib/trainingRecord';
import { IacraPdfDocument } from '@/app/(app)/admin/students/[id]/iacra.pdf/IacraPdfDocument';

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
  const [totals, schoolName] = await Promise.all([
    loadIacraTotals(caller.userId, caller.schoolId),
    loadSchoolName(caller.schoolId),
  ]);
  const generatedAt = new Date().toISOString().replace('T', ' ').slice(0, 19) + 'Z';
  const element = IacraPdfDocument({ identification, totals, schoolName, generatedAt });
  const stream = await renderToStream(element);

  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const safeLast = (identification.lastName || identification.fullName || 'student').replace(
    /[^a-zA-Z0-9]/g,
    '',
  );
  return new Response(stream as unknown as ReadableStream, {
    status: 200,
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `inline; filename="iacra-hours-${safeLast}-${today}.pdf"`,
      'cache-control': 'private, no-store',
    },
  });
}
