import { and, eq, sql } from 'drizzle-orm';
import { db, users } from '@part61/db';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { PendingApprovalList } from './PendingApprovalList';
import { PageHeader } from '@/components/ui';

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
    <main style={{ padding: '0 1.5rem 2rem', maxWidth: 1100, margin: '0 auto' }}>
      <PageHeader
        eyebrow="Directory"
        title="Pending Registrations"
        subtitle={`${rows.length} ${rows.length === 1 ? 'applicant' : 'applicants'} awaiting decision. Review and accept or reject each self-registered account below.`}
      />
      <PendingApprovalList rows={rows} />
    </main>
  );
}
