import Link from 'next/link';
import { redirect } from 'next/navigation';
import { eq, sql } from 'drizzle-orm';
import { db, users } from '@part61/db';
import { createSupabaseServerClient } from '@/lib/supabase/server';
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

const ACTION_LINK: React.CSSProperties = {
  display: 'inline-block',
  padding: '0.3rem 0.7rem',
  border: '1px solid rgba(56, 189, 248, 0.35)',
  background: 'rgba(56, 189, 248, 0.10)',
  color: '#38bdf8',
  borderRadius: 6,
  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
  fontSize: '0.7rem',
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  fontWeight: 600,
  textDecoration: 'none',
};

const SECTION_HEADING: React.CSSProperties = {
  margin: '0 0 0.75rem',
  fontFamily: '"Antonio", system-ui, sans-serif',
  fontSize: '1.05rem',
  letterSpacing: '0.02em',
  color: '#f7f9fc',
  textTransform: 'uppercase',
  fontWeight: 600,
};

const EMPTY: React.CSSProperties = {
  padding: '2.5rem 1rem',
  textAlign: 'center',
  color: '#7a869a',
  fontSize: '0.88rem',
  background: '#0d1220',
  border: '1px dashed #1f2940',
  borderRadius: 12,
};

function statusTone(status: string): { bg: string; fg: string; border: string } {
  if (status === 'passed')
    return {
      bg: 'rgba(52, 211, 153, 0.12)',
      fg: '#34d399',
      border: 'rgba(52, 211, 153, 0.35)',
    };
  if (status === 'failed')
    return {
      bg: 'rgba(248, 113, 113, 0.14)',
      fg: '#f87171',
      border: 'rgba(248, 113, 113, 0.35)',
    };
  return {
    bg: 'rgba(122, 134, 154, 0.14)',
    fg: '#7a869a',
    border: '#1f2940',
  };
}

export default async function StageChecksPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
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
    <main style={{ padding: '0 1.5rem 2rem', maxWidth: 1300, margin: '0 auto' }}>
      <PageHeader
        eyebrow="Training"
        title="Stage Checks"
        subtitle={`Total ${joined.length} · ${scheduled.length} scheduled · ${completed.length} completed. A stage check must be conducted by an instructor other than the student's primary instructor — the server enforces this.`}
      />

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
      <h2 style={SECTION_HEADING}>{title}</h2>
      {rows.length === 0 ? (
        <div style={EMPTY}>None.</div>
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
                <th style={TH}>Student</th>
                <th style={TH}>Stage</th>
                <th style={TH}>Checker</th>
                <th style={TH}>Status</th>
                <th style={TH}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const tone = statusTone(r.status);
                return (
                  <tr key={r.id} style={{ borderBottom: '1px solid #161d30' }}>
                    <td style={{ ...TD, color: '#f7f9fc', fontWeight: 500 }}>
                      {r.student_name ?? <span style={{ color: '#5b6784' }}>—</span>}
                    </td>
                    <td style={TD}>
                      <span
                        style={{
                          fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                          color: '#38bdf8',
                        }}
                      >
                        {r.stage_code}
                      </span>{' '}
                      — <span style={{ color: '#cbd5e1' }}>{r.stage_title}</span>
                    </td>
                    <td style={TD}>
                      {r.checker_name ?? <span style={{ color: '#5b6784' }}>—</span>}
                    </td>
                    <td style={TD}>
                      <span
                        style={{
                          display: 'inline-flex',
                          padding: '0.15rem 0.55rem',
                          borderRadius: 999,
                          background: tone.bg,
                          color: tone.fg,
                          border: `1px solid ${tone.border}`,
                          fontSize: '0.68rem',
                          fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                          letterSpacing: '0.1em',
                          textTransform: 'uppercase',
                          fontWeight: 600,
                        }}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td style={TD}>
                      <Link href={`/admin/stage-checks/${r.id}`} style={ACTION_LINK}>
                        Open
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
