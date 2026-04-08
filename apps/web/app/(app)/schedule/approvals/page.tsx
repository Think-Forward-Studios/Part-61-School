import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { and, eq, isNull } from 'drizzle-orm';
import { db, users, reservation } from '@part61/db';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ApprovalList } from './ApprovalList';

export const dynamic = 'force-dynamic';

export default async function ApprovalsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const me = (
    await db.select().from(users).where(eq(users.id, user.id)).limit(1)
  )[0];
  if (!me) redirect('/login');

  const cookieStore = await cookies();
  const activeRole = cookieStore.get('part61.active_role')?.value;
  if (activeRole !== 'instructor' && activeRole !== 'admin') {
    notFound();
  }

  const rows = await db
    .select()
    .from(reservation)
    .where(
      and(
        eq(reservation.schoolId, me.schoolId),
        eq(reservation.status, 'requested'),
        isNull(reservation.deletedAt),
      ),
    )
    .limit(500);

  return (
    <main style={{ padding: '1rem', maxWidth: 1100 }}>
      <h1>Pending reservation requests</h1>
      <p style={{ color: '#666' }}>
        Requests waiting for instructor or admin review.
      </p>
      <ApprovalList
        rows={rows.map((r) => ({
          id: r.id,
          activityType: r.activityType,
          status: r.status,
          timeRange: r.timeRange,
          aircraftId: r.aircraftId,
          instructorId: r.instructorId,
          studentId: r.studentId,
          roomId: r.roomId,
          notes: r.notes,
        }))}
      />
    </main>
  );
}
