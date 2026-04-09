/**
 * GET /admin/students/[id]/iacra.pdf — IACRA 8710-1 hours summary PDF (SYL-11).
 */
import { NextResponse } from 'next/server';
import { renderToStream } from '@react-pdf/renderer';
import {
  loadIacraTotals,
  loadIdentification,
  loadSchoolName,
  resolveCallerContext,
} from '@/lib/trainingRecord';
import { IacraPdfDocument } from './IacraPdfDocument';

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
  const [totals, schoolName] = await Promise.all([
    loadIacraTotals(studentUserId, caller.schoolId),
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
  const filename = `iacra-hours-${safeLast}-${today}.pdf`;

  return new Response(stream as unknown as ReadableStream, {
    status: 200,
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `inline; filename="${filename}"`,
      'cache-control': 'private, no-store',
    },
  });
}
