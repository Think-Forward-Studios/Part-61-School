import Link from 'next/link';
import { and, eq, isNull } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { db, users, room } from '@part61/db';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { CreateRoomForm } from './CreateRoomForm';
import { PageHeader } from '@/components/ui';

export const dynamic = 'force-dynamic';

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

export default async function AdminRoomsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const me = (await db.select().from(users).where(eq(users.id, user.id)).limit(1))[0];
  if (!me) redirect('/login');

  const rows = await db
    .select()
    .from(room)
    .where(and(eq(room.schoolId, me.schoolId), isNull(room.deletedAt)));

  const dash = <span style={{ color: '#5b6784' }}>—</span>;

  return (
    <main style={{ padding: '0 1.5rem 2rem', maxWidth: 1200, margin: '0 auto' }}>
      <PageHeader
        eyebrow="Facilities"
        title="Rooms"
        subtitle={`${rows.length} ${rows.length === 1 ? 'room' : 'rooms'} available for briefings, ground, and sims.`}
      />
      {rows.length === 0 ? (
        <div
          style={{
            padding: '3rem 1rem',
            textAlign: 'center',
            color: '#7a869a',
            fontSize: '0.88rem',
            background: '#0d1220',
            border: '1px dashed #1f2940',
            borderRadius: 12,
          }}
        >
          No rooms yet.
        </div>
      ) : (
        <div
          style={{
            background: '#0d1220',
            border: '1px solid #1f2940',
            borderRadius: 12,
            overflow: 'hidden',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ background: '#121826' }}>
                <th style={TH}>Name</th>
                <th style={TH}>Capacity</th>
                <th style={TH}>Features</th>
                <th style={TH}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} style={{ borderBottom: '1px solid #161d30' }}>
                  <td style={{ ...TD, color: '#f7f9fc', fontWeight: 500 }}>{r.name}</td>
                  <td style={TD}>{r.capacity ?? dash}</td>
                  <td
                    style={{
                      ...TD,
                      fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                      fontSize: '0.76rem',
                    }}
                  >
                    {r.features && r.features.length > 0 ? r.features.join(', ') : dash}
                  </td>
                  <td style={{ padding: '0.7rem 0.9rem' }}>
                    <Link
                      href={`/admin/rooms/${r.id}`}
                      style={{
                        padding: '0.35rem 0.8rem',
                        background: '#0d1220',
                        color: '#cbd5e1',
                        border: '1px solid #1f2940',
                        borderRadius: 6,
                        fontSize: '0.72rem',
                        fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                        letterSpacing: '0.1em',
                        textTransform: 'uppercase',
                        fontWeight: 600,
                        textDecoration: 'none',
                      }}
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <section style={{ marginTop: '2rem' }}>
        <h2
          style={{
            margin: '0 0 0.75rem',
            fontFamily: '"Antonio", system-ui, sans-serif',
            fontSize: '1.35rem',
            fontWeight: 600,
            color: '#f7f9fc',
            letterSpacing: '-0.01em',
          }}
        >
          Add room
        </h2>
        <CreateRoomForm />
      </section>
    </main>
  );
}
