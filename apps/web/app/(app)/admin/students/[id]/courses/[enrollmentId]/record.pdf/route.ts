/**
 * GET /admin/students/[id]/courses/[enrollmentId]/record.pdf
 *
 * Admin (or chief instructor / instructor) downloadable 14 CFR 141.101(a)(2)
 * training record PDF for the given student + enrollment. Sealed rows only.
 */
import { NextResponse } from 'next/server';
import { renderToStream } from '@react-pdf/renderer';
import { loadTrainingRecord, resolveCallerContext } from '@/lib/trainingRecord';
import { TrainingRecordPdfDocument } from './TrainingRecordPdfDocument';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteParams = Promise<{ id: string; enrollmentId: string }>;

export async function GET(_req: Request, ctx: { params: RouteParams }) {
  const { id: studentUserId, enrollmentId } = await ctx.params;

  const caller = await resolveCallerContext();
  if (!caller) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }
  const allowed = caller.roles.some((r) => r === 'admin' || r === 'instructor');
  if (!allowed) {
    return NextResponse.json(
      { error: 'Admin or instructor role required.' },
      { status: 403 },
    );
  }

  const data = await loadTrainingRecord(enrollmentId, caller.schoolId, studentUserId);
  if (!data) {
    return NextResponse.json({ error: 'Enrollment not found.' }, { status: 404 });
  }

  const element = TrainingRecordPdfDocument({ data });
  const stream = await renderToStream(element);

  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const safeLast = (data.identification.lastName || data.identification.fullName || 'student')
    .replace(/[^a-zA-Z0-9]/g, '');
  const filename = `training-record-${safeLast}-${today}.pdf`;

  return new Response(stream as unknown as ReadableStream, {
    status: 200,
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `inline; filename="${filename}"`,
      'cache-control': 'private, no-store',
    },
  });
}
