import { and, eq } from 'drizzle-orm';
import { notFound, redirect } from 'next/navigation';
import { db, users, room } from '@part61/db';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { EditRoomForm } from './EditRoomForm';
import { PageHeader } from '@/components/ui';

export const dynamic = 'force-dynamic';

type Params = Promise<{ id: string }>;

export default async function AdminRoomDetailPage({ params }: { params: Params }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const me = (await db.select().from(users).where(eq(users.id, user.id)).limit(1))[0];
  if (!me) redirect('/login');
  const r = (
    await db
      .select()
      .from(room)
      .where(and(eq(room.id, id), eq(room.schoolId, me.schoolId)))
      .limit(1)
  )[0];
  if (!r) notFound();

  return (
    <main style={{ padding: '0 1.5rem 2rem', maxWidth: 1200, margin: '0 auto' }}>
      <PageHeader eyebrow="Facilities" title="Edit Room" subtitle={r.name} />
      <EditRoomForm
        roomId={r.id}
        initial={{
          name: r.name,
          capacity: r.capacity ?? null,
          features: r.features ?? [],
        }}
      />
    </main>
  );
}
