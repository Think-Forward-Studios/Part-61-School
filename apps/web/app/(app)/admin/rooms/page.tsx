import Link from 'next/link';
import { and, eq, isNull } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { db, users, room } from '@part61/db';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { CreateRoomForm } from './CreateRoomForm';

export const dynamic = 'force-dynamic';

export default async function AdminRoomsPage() {
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
    .from(room)
    .where(and(eq(room.schoolId, me.schoolId), isNull(room.deletedAt)));

  return (
    <main style={{ padding: '1rem', maxWidth: 1100 }}>
      <h1>Rooms</h1>
      <table style={{ width: '100%', marginTop: '1rem', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
            <th style={{ padding: '0.5rem' }}>Name</th>
            <th style={{ padding: '0.5rem' }}>Capacity</th>
            <th style={{ padding: '0.5rem' }}>Features</th>
            <th style={{ padding: '0.5rem' }}></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} style={{ borderBottom: '1px solid #eee' }}>
              <td style={{ padding: '0.5rem' }}>{r.name}</td>
              <td style={{ padding: '0.5rem' }}>{r.capacity ?? '—'}</td>
              <td style={{ padding: '0.5rem', fontSize: '0.8rem' }}>
                {r.features?.join(', ') ?? ''}
              </td>
              <td style={{ padding: '0.5rem' }}>
                <Link href={`/admin/rooms/${r.id}`}>Edit</Link>
              </td>
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr>
              <td colSpan={4} style={{ padding: '0.5rem', color: '#666' }}>
                No rooms yet.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
      <section style={{ marginTop: '2rem' }}>
        <h2>Add room</h2>
        <CreateRoomForm />
      </section>
    </main>
  );
}
