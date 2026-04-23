import Link from 'next/link';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { db, users, personProfile } from '@part61/db';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { PeopleTable } from './PeopleTable';
import { PageHeader } from '@/components/ui';

export const dynamic = 'force-dynamic';

type SearchParams = Promise<{ role?: string; status?: string; deleted?: string }>;

export default async function AdminPeoplePage({ searchParams }: { searchParams: SearchParams }) {
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
  // When ?deleted=1 is on the URL, show soft-deleted users so an admin
  // can navigate back into one to restore it or purge it.
  const showDeleted = params.deleted === '1';

  // Raw SQL for the aggregation. Drizzle's query builder struggles
  // with ARRAY_AGG + filtered subqueries here.
  const roleClause = roleFilter
    ? sql`and exists (select 1 from public.user_roles ur where ur.user_id = u.id and ur.role = ${roleFilter}::public.role)`
    : sql``;
  const statusClause = statusFilter
    ? sql`and u.status = ${statusFilter}::public.user_status`
    : sql``;
  const deletedClause = showDeleted
    ? sql`and u.deleted_at is not null`
    : sql`and u.deleted_at is null`;
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
      ${deletedClause}
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
    <main style={{ padding: '0 1.5rem 2rem', maxWidth: 1300, margin: '0 auto' }}>
      <PageHeader
        eyebrow="Directory"
        title={showDeleted ? 'People — Deleted' : 'People'}
        subtitle={
          showDeleted
            ? `${rowsRaw.length} soft-deleted ${
                rowsRaw.length === 1 ? 'record' : 'records'
              }. Open a record to restore or purge.`
            : `${rowsRaw.length} ${rowsRaw.length === 1 ? 'record' : 'records'} · students, instructors, mechanics, admins.`
        }
        actions={
          <div style={{ display: 'inline-flex', gap: '0.5rem', alignItems: 'center' }}>
            <Link
              href={showDeleted ? '/admin/people' : '/admin/people?deleted=1'}
              style={{
                padding: '0.55rem 0.85rem',
                background: showDeleted ? 'rgba(251,191,36,0.15)' : 'rgba(255,255,255,0.04)',
                color: showDeleted ? '#fbbf24' : '#cbd5e1',
                border: showDeleted
                  ? '1px solid rgba(251,191,36,0.4)'
                  : '1px solid rgba(255,255,255,0.12)',
                borderRadius: 8,
                textDecoration: 'none',
                fontSize: '0.78rem',
                fontWeight: 600,
                letterSpacing: '0.05em',
              }}
            >
              {showDeleted ? '← Active only' : 'Show deleted'}
            </Link>
            {!showDeleted ? (
              <Link
                href="/admin/people/new"
                style={{
                  padding: '0.55rem 0.95rem',
                  background: 'linear-gradient(180deg, #fbbf24 0%, #f59e0b 100%)',
                  color: '#0a0e1a',
                  borderRadius: 8,
                  textDecoration: 'none',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  boxShadow:
                    '0 4px 14px rgba(251, 191, 36, 0.25), 0 1px 0 rgba(255, 255, 255, 0.15) inset',
                }}
              >
                + New Person
              </Link>
            ) : null}
          </div>
        }
      />
      <PeopleTable rows={rowsRaw} activeRole={roleFilter} activeStatus={statusFilter} />
    </main>
  );
}
