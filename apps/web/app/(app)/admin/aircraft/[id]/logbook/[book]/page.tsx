import { and, desc, eq } from 'drizzle-orm';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { db, users, aircraft as aircraftTable, logbookEntry } from '@part61/db';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/ui';

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

const TH: React.CSSProperties = {
  textAlign: 'left',
  padding: '0.65rem 0.9rem',
  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
  fontSize: '0.68rem',
  letterSpacing: '0.15em',
  color: '#7a869a',
  textTransform: 'uppercase',
  fontWeight: 500,
  borderBottom: '1px solid #1f2940',
};

const TD: React.CSSProperties = {
  padding: '0.7rem 0.9rem',
  color: '#cbd5e1',
  fontSize: '0.82rem',
};

const MONO_TD: React.CSSProperties = {
  ...TD,
  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
  fontSize: '0.76rem',
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
    <main style={{ padding: '0 1.5rem 2rem', maxWidth: 1300, margin: '0 auto' }}>
      <div style={{ marginBottom: '0.5rem' }}>
        <Link
          href={`/admin/aircraft/${id}`}
          style={{
            color: '#38bdf8',
            textDecoration: 'none',
            fontSize: '0.78rem',
            fontFamily: '"JetBrains Mono", ui-monospace, monospace',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          &larr; Back to aircraft
        </Link>
      </div>
      <PageHeader
        eyebrow="Maintenance"
        title={`${ac.tailNumber} — ${BOOK_LABEL[book]} Logbook`}
        subtitle={`${ac.make ?? ''} ${ac.model ?? ''}${ac.year ? ` (${ac.year})` : ''}`.trim()}
        actions={
          <a
            href={`/admin/aircraft/${id}/logbook/${book}/export.pdf`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              padding: '0.55rem 0.95rem',
              background: 'linear-gradient(180deg, #fbbf24 0%, #f59e0b 100%)',
              color: '#0a0e1a',
              borderRadius: 8,
              textDecoration: 'none',
              fontSize: '0.78rem',
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              boxShadow:
                '0 4px 14px rgba(251, 191, 36, 0.25), 0 1px 0 rgba(255, 255, 255, 0.15) inset',
            }}
          >
            Export PDF
          </a>
        }
      />

      <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        {books.map((b) => {
          const active = b === book;
          return (
            <Link
              key={b}
              href={`/admin/aircraft/${id}/logbook/${b}`}
              style={{
                padding: '0.35rem 0.85rem',
                borderRadius: 999,
                border: `1px solid ${active ? '#38bdf8' : '#1f2940'}`,
                background: active ? 'rgba(56, 189, 248, 0.12)' : '#0d1220',
                color: active ? '#38bdf8' : '#cbd5e1',
                textDecoration: 'none',
                fontSize: '0.78rem',
                fontWeight: active ? 600 : 500,
                letterSpacing: active ? '0.05em' : undefined,
              }}
            >
              {BOOK_LABEL[b]}
            </Link>
          );
        })}
      </div>

      <div
        style={{
          background: '#0d1220',
          border: '1px solid #1f2940',
          borderRadius: 12,
          overflow: 'hidden',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#121826' }}>
              <th style={TH}>Date</th>
              <th style={TH}>Description</th>
              <th style={{ ...TH, textAlign: 'right' }}>Hobbs</th>
              <th style={{ ...TH, textAlign: 'right' }}>Tach</th>
              <th style={{ ...TH, textAlign: 'right' }}>Airframe</th>
              <th style={TH}>Signer</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  style={{
                    padding: '2rem 1rem',
                    textAlign: 'center',
                    fontStyle: 'italic',
                    color: '#7a869a',
                    fontSize: '0.85rem',
                  }}
                >
                  No entries in this book yet.
                </td>
              </tr>
            ) : (
              rows.map((e) => (
                <tr key={e.id} style={{ borderBottom: '1px solid #161d30' }}>
                  <td style={{ ...MONO_TD, whiteSpace: 'nowrap' }}>{String(e.entryDate)}</td>
                  <td style={TD}>
                    {e.description}
                    {!e.sealed && (
                      <span
                        style={{
                          marginLeft: 8,
                          fontSize: '0.68rem',
                          padding: '0.15rem 0.5rem',
                          borderRadius: 4,
                          background: 'rgba(251, 191, 36, 0.12)',
                          color: '#fbbf24',
                          border: '1px solid rgba(251, 191, 36, 0.35)',
                          fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                          letterSpacing: '0.1em',
                          textTransform: 'uppercase',
                          fontWeight: 700,
                        }}
                      >
                        DRAFT
                      </span>
                    )}
                  </td>
                  <td style={{ ...MONO_TD, textAlign: 'right' }}>
                    {fmt(e.hobbs as string | null)}
                  </td>
                  <td style={{ ...MONO_TD, textAlign: 'right' }}>{fmt(e.tach as string | null)}</td>
                  <td style={{ ...MONO_TD, textAlign: 'right' }}>
                    {fmt(e.airframeTime as string | null)}
                  </td>
                  <td
                    style={{
                      ...MONO_TD,
                      color: e.sealed ? '#cbd5e1' : '#5b6784',
                    }}
                  >
                    {e.sealed ? signerDisplay(e.signerSnapshot) : 'Not yet sealed'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
