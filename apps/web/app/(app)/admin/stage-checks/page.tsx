import Link from 'next/link';
import { redirect } from 'next/navigation';
import { eq, sql } from 'drizzle-orm';
import { db, users } from '@part61/db';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function StageChecksPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const me = (await db.select().from(users).where(eq(users.id, user.id)).limit(1))[0];
  if (!me?.schoolId) redirect('/login');

  // Hydrate names
  const joined = (await db.execute(sql`
    select
      sc.id, sc.status, sc.scheduled_at, sc.conducted_at, sc.sealed_at,
      coalesce(nullif(trim(concat_ws(' ', spp.first_name, spp.last_name)), ''), su.full_name, su.email) as student_name,
      coalesce(nullif(trim(concat_ws(' ', cpp.first_name, cpp.last_name)), ''), cu.full_name, cu.email) as checker_name,
      s.code as stage_code, s.title as stage_title
    from public.stage_check sc
    join public.student_course_enrollment sce on sce.id = sc.student_enrollment_id
    join public.users su on su.id = sce.user_id
    left join public.person_profile spp on spp.user_id = su.id
    join public.users cu on cu.id = sc.checker_user_id
    left join public.person_profile cpp on cpp.user_id = cu.id
    join public.stage s on s.id = sc.stage_id
    where sc.school_id = ${me.schoolId}::uuid and sc.deleted_at is null
    order by sc.created_at desc
  `)) as unknown as Array<{
    id: string;
    status: string;
    scheduled_at: string | null;
    conducted_at: string | null;
    sealed_at: string | null;
    student_name: string | null;
    checker_name: string | null;
    stage_code: string;
    stage_title: string;
  }>;

  const scheduled = joined.filter((r) => r.status === 'scheduled');
  const completed = joined.filter((r) => r.status !== 'scheduled');

  return (
    <main style={{ padding: '1rem', maxWidth: 1000 }}>
      <h1>Stage checks</h1>
      <p style={{ color: '#555', fontSize: '0.85rem' }}>
        Total {joined.length} · {scheduled.length} scheduled · {completed.length} completed
      </p>
      <p style={{ fontSize: '0.8rem', color: '#666' }}>
        Reminder: a stage check must be conducted by an instructor other than the
        student&rsquo;s primary instructor. The server enforces this.
      </p>

      <Section title="Scheduled" rows={scheduled} />
      <Section title="Completed" rows={completed} />
    </main>
  );
}

function Section({
  title,
  rows,
}: {
  title: string;
  rows: Array<{
    id: string;
    status: string;
    scheduled_at: string | null;
    sealed_at: string | null;
    student_name: string | null;
    checker_name: string | null;
    stage_code: string;
    stage_title: string;
  }>;
}) {
  return (
    <section style={{ marginTop: '1.5rem' }}>
      <h2>{title}</h2>
      {rows.length === 0 ? (
        <p style={{ color: '#888' }}>None.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #ddd', textAlign: 'left' }}>
              <th style={{ padding: '0.5rem' }}>Student</th>
              <th style={{ padding: '0.5rem' }}>Stage</th>
              <th style={{ padding: '0.5rem' }}>Checker</th>
              <th style={{ padding: '0.5rem' }}>Status</th>
              <th style={{ padding: '0.5rem' }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const color =
                r.status === 'passed' ? '#16a34a' : r.status === 'failed' ? '#dc2626' : '#6b7280';
              return (
                <tr key={r.id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '0.5rem' }}>{r.student_name ?? '—'}</td>
                  <td style={{ padding: '0.5rem' }}>
                    {r.stage_code} — {r.stage_title}
                  </td>
                  <td style={{ padding: '0.5rem' }}>{r.checker_name ?? '—'}</td>
                  <td style={{ padding: '0.5rem', color, fontWeight: 600 }}>{r.status}</td>
                  <td style={{ padding: '0.5rem' }}>
                    <Link href={`/admin/stage-checks/${r.id}`}>Open</Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
