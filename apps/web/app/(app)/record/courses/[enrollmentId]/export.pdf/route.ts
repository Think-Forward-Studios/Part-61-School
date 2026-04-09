/**
 * GET /record/courses/[enrollmentId]/export.pdf — student self-serve
 * 141.101 training record PDF for the caller's own enrollment (STU-02).
 *
 * Auth: strictly scoped to ctx.session.userId. Cannot download another
 * student's record because loadTrainingRecord scopes by userId.
 */
import { NextResponse } from 'next/server';
import { renderToStream } from '@react-pdf/renderer';
import { loadTrainingRecord, resolveCallerContext } from '@/lib/trainingRecord';
import { TrainingRecordPdfDocument } from '@/app/(app)/admin/students/[id]/courses/[enrollmentId]/record.pdf/TrainingRecordPdfDocument';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteParams = Promise<{ enrollmentId: string }>;

export async function GET(_req: Request, ctx: { params: RouteParams }) {
  const { enrollmentId } = await ctx.params;
  const caller = await resolveCallerContext();
  if (!caller) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }
  const data = await loadTrainingRecord(enrollmentId, caller.schoolId, caller.userId);
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
