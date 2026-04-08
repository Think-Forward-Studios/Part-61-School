import { and, eq, sql } from 'drizzle-orm';
import { db, users } from '@part61/db';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { PendingApprovalList } from './PendingApprovalList';

export const dynamic = 'force-dynamic';

export default async function PendingPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const me = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  const schoolId = me[0]?.schoolId;
  if (!schoolId) redirect('/login');

  const rows = (await db.execute(sql`
    select u.id, u.email, u.created_at, pp.first_name, pp.last_name, pp.phone
    from public.users u
    left join public.person_profile pp on pp.user_id = u.id
    where u.school_id = ${schoolId}
      and u.status = 'pending'
      and u.deleted_at is null
    order by u.created_at asc
  `)) as unknown as Array<{
    id: string;
    email: string;
    created_at: string;
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
  }>;

  void and;

  return (
    <main style={{ padding: '1rem', maxWidth: 1000 }}>
      <h1>Pending Registrations</h1>
      <p>Review and decision each self-registered applicant below.</p>
      <PendingApprovalList rows={rows} />
    </main>
  );
}
