import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { db, users, reservation } from '@part61/db';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { CloseOutForm } from './CloseOutForm';

export const dynamic = 'force-dynamic';

/**
 * /dispatch/close/[id] — flight close-out (SCH-08, SCH-09, INS-04, FTR-08).
 *
 * Server fetches the reservation, the form does the rest. Both
 * student and instructor can submit; only an instructor's
 * sign-off transitions the reservation to closed (otherwise it
 * lands in pending_sign_off).
 */
export default async function CloseOutPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const me = (
    await db.select().from(users).where(eq(users.id, user.id)).limit(1)
  )[0];
  if (!me) redirect('/login');

  const r = (
    await db
      .select()
      .from(reservation)
      .where(and(eq(reservation.id, id), eq(reservation.schoolId, me.schoolId)))
      .limit(1)
  )[0];
  if (!r) notFound();

  const cookieStore = await cookies();
  const activeRole = cookieStore.get('part61.active_role')?.value ?? 'student';
  const canSignOff = activeRole === 'instructor' || activeRole === 'admin';

  return (
    <main style={{ padding: '1rem', maxWidth: 900 }}>
      <h1>Close out flight</h1>
      <p style={{ color: '#666', fontSize: '0.85rem' }}>
        Reservation {r.id.slice(0, 8)} · status {r.status}
      </p>
      <CloseOutForm
        reservationId={r.id}
        activityType={r.activityType}
        canSignOff={canSignOff}
      />
    </main>
  );
}
