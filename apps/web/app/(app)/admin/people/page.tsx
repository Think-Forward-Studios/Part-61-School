import Link from 'next/link';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { db, users, personProfile } from '@part61/db';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { PeopleTable } from './PeopleTable';

export const dynamic = 'force-dynamic';

type SearchParams = Promise<{ role?: string; status?: string }>;

export default async function AdminPeoplePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const me = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  const schoolId = me[0]?.schoolId;
  if (!schoolId) redirect('/login');

  const params = await searchParams;
  const roleFilter = params.role;
  const statusFilter = params.status;

  // Raw SQL for the aggregation. Drizzle's query builder struggles
  // with ARRAY_AGG + filtered subqueries here.
  const roleClause = roleFilter
    ? sql`and exists (select 1 from public.user_roles ur where ur.user_id = u.id and ur.role = ${roleFilter}::public.role)`
    : sql``;
  const statusClause = statusFilter
    ? sql`and u.status = ${statusFilter}::public.user_status`
    : sql``;
  const rowsRaw = (await db.execute(sql`
    select
      u.id,
      u.email,
      u.status,
      pp.first_name,
      pp.last_name,
      pp.phone,
      coalesce(
        (select array_agg(ur.role::text)
           from public.user_roles ur
           where ur.user_id = u.id),
        '{}'::text[]
      ) as roles,
      (select count(*)::int
         from public.person_hold ph
         where ph.user_id = u.id and ph.cleared_at is null) as active_hold_count
    from public.users u
    left join public.person_profile pp on pp.user_id = u.id
    where u.school_id = ${schoolId}
      and u.deleted_at is null
      ${roleClause}
      ${statusClause}
    order by coalesce(pp.last_name, u.email)
    limit 500
  `)) as unknown as Array<{
    id: string;
    email: string;
    status: string;
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
    roles: string[];
    active_hold_count: number;
  }>;

  void personProfile;
  void and;
  void isNull;

  return (
    <main style={{ padding: '1rem', maxWidth: 1200 }}>
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <h1>People</h1>
        <Link
          href="/admin/people/new"
          style={{
            padding: '0.5rem 1rem',
            background: '#0070f3',
            color: 'white',
            borderRadius: 4,
            textDecoration: 'none',
          }}
        >
          + New Person
        </Link>
      </header>
      <PeopleTable
        rows={rowsRaw}
        activeRole={roleFilter}
        activeStatus={statusFilter}
      />
    </main>
  );
}
