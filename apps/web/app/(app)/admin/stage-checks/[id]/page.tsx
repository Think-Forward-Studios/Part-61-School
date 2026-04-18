import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { and, eq, isNull } from 'drizzle-orm';
import { db, users, stageCheck } from '@part61/db';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { RecordStageCheck } from './RecordStageCheck';
import { PageHeader } from '@/components/ui';

export const dynamic = 'force-dynamic';

type Params = Promise<{ id: string }>;

const BACK_LINK: React.CSSProperties = {
  display: 'inline-block',
  color: '#7a869a',
  textDecoration: 'none',
  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
  fontSize: '0.72rem',
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  marginBottom: '0.75rem',
};

const SECTION_HEADING: React.CSSProperties = {
  margin: '0 0 0.5rem',
  fontFamily: '"Barlow Condensed", system-ui, sans-serif',
  fontSize: '0.95rem',
  letterSpacing: '0.08em',
  color: '#f7f9fc',
  textTransform: 'uppercase',
  fontWeight: 600,
};

export default async function StageCheckDetail({ params }: { params: Params }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const me = (await db.select().from(users).where(eq(users.id, user.id)).limit(1))[0];
  if (!me?.schoolId) redirect('/login');

  const sc = (
    await db
      .select()
      .from(stageCheck)
      .where(
        and(
          eq(stageCheck.id, id),
          eq(stageCheck.schoolId, me.schoolId),
          isNull(stageCheck.deletedAt),
        ),
      )
      .limit(1)
  )[0];
  if (!sc) notFound();

  const isSealed = sc.sealedAt !== null;

  const subtitleParts: string[] = [`status: ${sc.status}`];
  if (sc.scheduledAt) subtitleParts.push(`scheduled ${new Date(sc.scheduledAt).toLocaleString()}`);
  if (sc.conductedAt) subtitleParts.push(`conducted ${new Date(sc.conductedAt).toLocaleString()}`);

  return (
    <main style={{ padding: '0 1.5rem 2rem', maxWidth: 1300, margin: '0 auto' }}>
      <Link href="/admin/stage-checks" style={BACK_LINK}>
        ← Stage checks
      </Link>
      <PageHeader eyebrow="Training" title="Stage check" subtitle={subtitleParts.join(' · ')} />

      {sc.remarks ? (
        <section
          style={{
            marginTop: '0.5rem',
            padding: '1rem',
            background: '#0d1220',
            border: '1px solid #1f2940',
            borderRadius: 10,
          }}
        >
          <h3 style={SECTION_HEADING}>Remarks</h3>
          <pre
            style={{
              whiteSpace: 'pre-wrap',
              fontFamily: 'inherit',
              margin: 0,
              color: '#cbd5e1',
              fontSize: '0.9rem',
            }}
          >
            {sc.remarks}
          </pre>
        </section>
      ) : null}

      {isSealed ? (
        <div
          style={{
            marginTop: '1rem',
            padding: '0.85rem 1rem',
            background: 'rgba(52, 211, 153, 0.10)',
            border: '1px solid rgba(52, 211, 153, 0.35)',
            borderRadius: 8,
            color: '#34d399',
            fontSize: '0.85rem',
          }}
        >
          <strong style={{ color: '#34d399' }}>Sealed</strong>{' '}
          <span style={{ color: '#cbd5e1' }}>
            at {new Date(sc.sealedAt!).toLocaleString()}. This record is immutable.
          </span>
        </div>
      ) : (
        <RecordStageCheck stageCheckId={id} />
      )}
    </main>
  );
}
