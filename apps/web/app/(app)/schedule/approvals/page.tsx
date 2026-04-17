import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { and, eq, isNull } from 'drizzle-orm';
import { db, users, reservation } from '@part61/db';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ApprovalList } from './ApprovalList';
import { PageHeader } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function ApprovalsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const me = (await db.select().from(users).where(eq(users.id, user.id)).limit(1))[0];
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
    <main style={{ padding: '0 1.5rem 2rem', maxWidth: 1200, margin: '0 auto' }}>
      <PageHeader
        eyebrow="Schedule"
        title="Pending Approvals"
        subtitle={`${rows.length} ${rows.length === 1 ? 'request' : 'requests'} waiting for instructor or admin review.`}
      />
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
