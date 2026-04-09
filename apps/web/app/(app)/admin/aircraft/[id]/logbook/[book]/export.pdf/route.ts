/**
 * GET /admin/aircraft/[id]/logbook/[book]/export.pdf
 *
 * Streams a rendered aircraft logbook PDF (MNT-10). Mechanic or admin role
 * required. Uses @react-pdf/renderer (see ../pdf/README.md for the library
 * choice rationale).
 *
 * Runtime is pinned to nodejs (not edge) because react-pdf needs Node APIs
 * (Buffer / stream). Dynamic is forced so the route is never statically
 * pre-rendered at build time.
 */
import { NextResponse } from 'next/server';
import { and, desc, eq, sql } from 'drizzle-orm';
import {
  db,
  users,
  aircraft as aircraftTable,
  aircraftCurrentTotals,
  logbookEntry,
} from '@part61/db';
import { renderToStream } from '@react-pdf/renderer';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { LogbookPdfDocument, type LogbookPdfEntry } from '../pdf/LogbookPdfDocument';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteParams = Promise<{ id: string; book: string }>;

function isBook(x: string): x is 'airframe' | 'engine' | 'prop' {
  return x === 'airframe' || x === 'engine' || x === 'prop';
}

type SignerSnapshotRow = {
  full_name?: string;
  fullName?: string;
  first_name?: string;
  last_name?: string;
  certificate_type?: string;
  certificateType?: string;
  certificate_number?: string;
  certificateNumber?: string;
};

function extractSigner(raw: unknown): LogbookPdfEntry['signer'] {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as SignerSnapshotRow;
  const fullName =
    s.full_name ?? s.fullName ?? [s.first_name, s.last_name].filter(Boolean).join(' ').trim();
  const certificateType = s.certificate_type ?? s.certificateType ?? '';
  const certificateNumber = s.certificate_number ?? s.certificateNumber ?? '';
  if (!fullName || !certificateNumber) return null;
  return {
    fullName,
    certificateType: certificateType || 'mechanic',
    certificateNumber,
  };
}

export async function GET(_req: Request, ctx: { params: RouteParams }) {
  const { id, book } = await ctx.params;
  if (!isBook(book)) {
    return NextResponse.json(
      { error: 'Unknown book kind. Expected airframe | engine | prop.' },
      { status: 400 },
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }

  const me = (await db.select().from(users).where(eq(users.id, user.id)).limit(1))[0];
  if (!me) {
    return NextResponse.json({ error: 'Profile not found.' }, { status: 401 });
  }
  const schoolId = me.schoolId;
  if (!schoolId) {
    return NextResponse.json({ error: 'No school context.' }, { status: 401 });
  }

  // Role gate: mechanic or admin via user_roles (mirrors mechanicOrAdminProcedure).
  const roleRows = (await db.execute(sql`
    select 1 from public.user_roles
     where user_id = ${user.id}::uuid
       and role in ('mechanic','admin')
     limit 1
  `)) as unknown as Array<Record<string, unknown>>;
  if (roleRows.length === 0) {
    return NextResponse.json({ error: 'Mechanic or admin role required.' }, { status: 403 });
  }

  const ac = (
    await db
      .select()
      .from(aircraftTable)
      .where(and(eq(aircraftTable.id, id), eq(aircraftTable.schoolId, schoolId)))
      .limit(1)
  )[0];
  if (!ac) {
    return NextResponse.json({ error: 'Aircraft not found.' }, { status: 404 });
  }

  const totals = (
    await db
      .select()
      .from(aircraftCurrentTotals)
      .where(eq(aircraftCurrentTotals.aircraftId, id))
      .limit(1)
  )[0];

  const entries = await db
    .select()
    .from(logbookEntry)
    .where(
      and(
        eq(logbookEntry.aircraftId, id),
        eq(logbookEntry.schoolId, schoolId),
        eq(logbookEntry.bookKind, book),
        eq(logbookEntry.sealed, true),
      ),
    )
    .orderBy(desc(logbookEntry.entryDate), desc(logbookEntry.createdAt));

  const pdfEntries: LogbookPdfEntry[] = entries.map((e) => ({
    id: e.id,
    entryDate: String(e.entryDate),
    description: e.description,
    hobbs: e.hobbs as string | null,
    tach: e.tach as string | null,
    airframeTime: e.airframeTime as string | null,
    engineTime: e.engineTime as string | null,
    sealed: e.sealed,
    signer: extractSigner(e.signerSnapshot),
  }));

  const docProps = {
    aircraft: {
      tailNumber: ac.tailNumber,
      make: ac.make,
      model: ac.model,
      year: ac.year,
      serialNumber: null,
    },
    book,
    currentTotals: {
      hobbs: (totals?.currentHobbs as string | null) ?? null,
      tach: (totals?.currentTach as string | null) ?? null,
      airframe: (totals?.currentAirframe as string | null) ?? null,
    },
    entries: pdfEntries,
    generatedAt: new Date().toISOString().replace('T', ' ').slice(0, 19) + 'Z',
  };

  // renderToStream wants a Document element; LogbookPdfDocument returns one.
  const element = LogbookPdfDocument(docProps);
  const stream = await renderToStream(element);

  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const filename = `logbook-${ac.tailNumber}-${book}-${today}.pdf`;

  return new Response(stream as unknown as ReadableStream, {
    status: 200,
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `inline; filename="${filename}"`,
      'cache-control': 'private, no-store',
    },
  });
}
