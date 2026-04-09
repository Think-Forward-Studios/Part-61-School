import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { and, eq, isNull } from 'drizzle-orm';
import { db, users, stageCheck } from '@part61/db';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { RecordStageCheck } from './RecordStageCheck';

export const dynamic = 'force-dynamic';

type Params = Promise<{ id: string }>;

export default async function StageCheckDetail({ params }: { params: Params }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
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

  return (
    <main style={{ padding: '1rem', maxWidth: 800 }}>
      <p style={{ fontSize: '0.85rem' }}>
        <Link href="/admin/stage-checks">← Stage checks</Link>
      </p>
      <h1>Stage check</h1>
      <p style={{ color: '#555' }}>
        Status: <strong>{sc.status}</strong>
        {sc.scheduledAt ? ` · scheduled ${new Date(sc.scheduledAt).toLocaleString()}` : ''}
        {sc.conductedAt ? ` · conducted ${new Date(sc.conductedAt).toLocaleString()}` : ''}
      </p>

      {sc.remarks ? (
        <section style={{ marginTop: '1rem' }}>
          <h3>Remarks</h3>
          <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>{sc.remarks}</pre>
        </section>
      ) : null}

      {isSealed ? (
        <div
          style={{
            marginTop: '1rem',
            padding: '0.75rem',
            background: '#dcfce7',
            border: '2px solid #16a34a',
            borderRadius: 4,
          }}
        >
          <strong>Sealed</strong> at {new Date(sc.sealedAt!).toLocaleString()}. This record
          is immutable.
        </div>
      ) : (
        <RecordStageCheck stageCheckId={id} />
      )}
    </main>
  );
}
