import Link from 'next/link';
import { and, eq, isNull } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { db, users, scheduleBlock } from '@part61/db';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { BlockActions } from './BlockActions';

export const dynamic = 'force-dynamic';

export default async function AdminBlocksPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const me = (
    await db.select().from(users).where(eq(users.id, user.id)).limit(1)
  )[0];
  if (!me) redirect('/login');

  const rows = await db
    .select()
    .from(scheduleBlock)
    .where(
      and(
        eq(scheduleBlock.schoolId, me.schoolId),
        isNull(scheduleBlock.deletedAt),
      ),
    );

  return (
    <main style={{ padding: '1rem', maxWidth: 1100 }}>
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <h1>Schedule blocks</h1>
        <Link
          href="/admin/blocks/new"
          style={{
            padding: '0.5rem 1rem',
            background: '#0070f3',
            color: 'white',
            borderRadius: 4,
            textDecoration: 'none',
          }}
        >
          + New block
        </Link>
      </header>
      <table style={{ width: '100%', marginTop: '1rem', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
            <th style={{ padding: '0.5rem' }}>Kind</th>
            <th style={{ padding: '0.5rem' }}>Instructor</th>
            <th style={{ padding: '0.5rem' }}>Aircraft</th>
            <th style={{ padding: '0.5rem' }}>Room</th>
            <th style={{ padding: '0.5rem' }}>Notes</th>
            <th style={{ padding: '0.5rem' }}></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((b) => (
            <tr key={b.id} style={{ borderBottom: '1px solid #eee' }}>
              <td style={{ padding: '0.5rem' }}>{b.kind}</td>
              <td style={{ padding: '0.5rem', fontSize: '0.8rem' }}>
                {b.instructorId ?? '—'}
              </td>
              <td style={{ padding: '0.5rem', fontSize: '0.8rem' }}>
                {b.aircraftId ?? '—'}
              </td>
              <td style={{ padding: '0.5rem', fontSize: '0.8rem' }}>
                {b.roomId ?? '—'}
              </td>
              <td style={{ padding: '0.5rem', fontSize: '0.8rem' }}>
                {b.notes ?? ''}
              </td>
              <td style={{ padding: '0.5rem' }}>
                <BlockActions blockId={b.id} />
              </td>
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr>
              <td colSpan={6} style={{ padding: '0.5rem', color: '#666' }}>
                No blocks yet.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </main>
  );
}
