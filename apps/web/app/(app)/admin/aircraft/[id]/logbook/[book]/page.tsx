import { and, desc, eq } from 'drizzle-orm';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { db, users, aircraft as aircraftTable, logbookEntry } from '@part61/db';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type Params = Promise<{ id: string; book: string }>;
type BookKind = 'airframe' | 'engine' | 'prop';

function isBook(x: string): x is BookKind {
  return x === 'airframe' || x === 'engine' || x === 'prop';
}

const BOOK_LABEL: Record<BookKind, string> = {
  airframe: 'Airframe',
  engine: 'Engine',
  prop: 'Propeller',
};

type SignerShape = {
  full_name?: string;
  fullName?: string;
  first_name?: string;
  last_name?: string;
  certificate_type?: string;
  certificateType?: string;
  certificate_number?: string;
  certificateNumber?: string;
};

function signerDisplay(raw: unknown): string {
  if (!raw || typeof raw !== 'object') return '—';
  const s = raw as SignerShape;
  const name =
    s.full_name ?? s.fullName ?? [s.first_name, s.last_name].filter(Boolean).join(' ').trim();
  const type = (s.certificate_type ?? s.certificateType ?? '').toUpperCase();
  const num = s.certificate_number ?? s.certificateNumber ?? '';
  if (!name || !num) return '—';
  return `${name}, ${type || 'MECH'} ${num}`;
}

function fmt(x: string | number | null | undefined): string {
  if (x == null || x === '') return '—';
  const n = Number(x);
  if (!Number.isFinite(n)) return '—';
  return n.toFixed(1);
}

export default async function LogbookPage({ params }: { params: Params }) {
  const { id, book } = await params;
  if (!isBook(book)) notFound();

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const me = (await db.select().from(users).where(eq(users.id, user.id)).limit(1))[0];
  if (!me?.schoolId) redirect('/login');

  const ac = (
    await db
      .select()
      .from(aircraftTable)
      .where(and(eq(aircraftTable.id, id), eq(aircraftTable.schoolId, me.schoolId)))
      .limit(1)
  )[0];
  if (!ac) notFound();

  const rows = await db
    .select()
    .from(logbookEntry)
    .where(
      and(
        eq(logbookEntry.aircraftId, id),
        eq(logbookEntry.schoolId, me.schoolId),
        eq(logbookEntry.bookKind, book),
      ),
    )
    .orderBy(desc(logbookEntry.entryDate), desc(logbookEntry.createdAt));

  const books: BookKind[] = ['airframe', 'engine', 'prop'];

  return (
    <main style={{ padding: '1rem', maxWidth: 1100 }}>
      <div style={{ marginBottom: 8 }}>
        <Link href={`/admin/aircraft/${id}`}>&larr; Back to aircraft</Link>
      </div>
      <h1 style={{ marginBottom: 4 }}>
        {ac.tailNumber} — {BOOK_LABEL[book]} Logbook
      </h1>
      <div style={{ color: '#555', marginBottom: 12 }}>
        {ac.make} {ac.model} {ac.year ? `(${ac.year})` : ''}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
        {books.map((b) => (
          <Link
            key={b}
            href={`/admin/aircraft/${id}/logbook/${b}`}
            style={{
              padding: '6px 12px',
              borderRadius: 4,
              border: '1px solid #ccc',
              background: b === book ? '#0b5fff' : '#fff',
              color: b === book ? '#fff' : '#0b5fff',
              textDecoration: 'none',
              fontWeight: 600,
            }}
          >
            {BOOK_LABEL[b]}
          </Link>
        ))}
        <div style={{ flex: 1 }} />
        <a
          href={`/admin/aircraft/${id}/logbook/${book}/export.pdf`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            padding: '10px 18px',
            background: '#0b5fff',
            color: '#fff',
            borderRadius: 4,
            textDecoration: 'none',
            fontWeight: 700,
          }}
        >
          Export PDF
        </a>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: '#f0f0f0', textAlign: 'left' }}>
            <th style={{ padding: 6 }}>Date</th>
            <th style={{ padding: 6 }}>Description</th>
            <th style={{ padding: 6, textAlign: 'right' }}>Hobbs</th>
            <th style={{ padding: 6, textAlign: 'right' }}>Tach</th>
            <th style={{ padding: 6, textAlign: 'right' }}>Airframe</th>
            <th style={{ padding: 6 }}>Signer</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={6} style={{ padding: 12, fontStyle: 'italic', color: '#666' }}>
                No entries in this book yet.
              </td>
            </tr>
          ) : (
            rows.map((e) => (
              <tr key={e.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: 6, whiteSpace: 'nowrap' }}>{String(e.entryDate)}</td>
                <td style={{ padding: 6 }}>
                  {e.description}
                  {!e.sealed && (
                    <span
                      style={{
                        marginLeft: 8,
                        fontSize: 10,
                        padding: '1px 6px',
                        borderRadius: 10,
                        background: '#fde68a',
                        color: '#78350f',
                        fontWeight: 700,
                      }}
                    >
                      DRAFT
                    </span>
                  )}
                </td>
                <td style={{ padding: 6, textAlign: 'right' }}>{fmt(e.hobbs as string | null)}</td>
                <td style={{ padding: 6, textAlign: 'right' }}>{fmt(e.tach as string | null)}</td>
                <td style={{ padding: 6, textAlign: 'right' }}>
                  {fmt(e.airframeTime as string | null)}
                </td>
                <td style={{ padding: 6, color: e.sealed ? '#111' : '#999' }}>
                  {e.sealed ? signerDisplay(e.signerSnapshot) : 'Not yet sealed'}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </main>
  );
}
