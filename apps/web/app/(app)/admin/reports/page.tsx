import { cookies } from 'next/headers';
import { redirect, notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PageHeader, Card } from '@/components/ui';

export const dynamic = 'force-dynamic';

const REPORTS = [
  {
    slug: 'fleet-utilization',
    title: 'Fleet Utilization',
    code: 'FLT-UTIL',
    accent: '#38bdf8',
    desc: 'Flight hours, scheduled hours, utilization %, squawk counts per aircraft.',
  },
  {
    slug: 'instructor-utilization',
    title: 'Instructor Utilization',
    code: 'CFI-UTIL',
    accent: '#38bdf8',
    desc: 'Scheduled vs flown hours, pass rate, duty-hour warnings per instructor.',
  },
  {
    slug: 'student-progress',
    title: 'Student Progress',
    code: 'STU-PROG',
    accent: '#34d399',
    desc: 'Course progress, hours flown, ahead/behind indicator per student.',
  },
  {
    slug: 'no-show-rate',
    title: 'No-Show Rate',
    code: 'NO-SHOW',
    accent: '#fbbf24',
    desc: 'No-show count and rate per student with school-wide summary.',
  },
  {
    slug: 'squawk-turnaround',
    title: 'Squawk Turnaround',
    code: 'SQWK-TT',
    accent: '#a78bfa',
    desc: 'Open/closed squawk counts and avg resolution time per aircraft.',
  },
  {
    slug: 'course-completion',
    title: 'Course Completion',
    code: 'COMPLETE',
    accent: '#34d399',
    desc: 'Enrollment, completion rate, and avg days to complete per course.',
  },
];

export default async function ReportsIndexPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const cookieStore = await cookies();
  if (cookieStore.get('part61.active_role')?.value !== 'admin') notFound();

  return (
    <main style={{ padding: '0 1.5rem 2rem', maxWidth: 1200, margin: '0 auto' }}>
      <PageHeader
        eyebrow="Analytics"
        title="Reports"
        subtitle="Six standard reports with CSV and PDF exports. Filter by base or roll up across all."
      />
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: '0.9rem',
        }}
      >
        {REPORTS.map((r) => (
          <Card
            key={r.slug}
            href={`/admin/reports/${r.slug}`}
            accent={r.accent}
            title={r.title}
            subtitle={
              <span
                style={{
                  fontFamily: '"JetBrains Mono", monospace',
                  fontSize: '0.68rem',
                  letterSpacing: '0.2em',
                  color: r.accent,
                  textTransform: 'uppercase',
                }}
              >
                {r.code}
              </span>
            }
          >
            {r.desc}
          </Card>
        ))}
      </div>
    </main>
  );
}
