import { cookies } from 'next/headers';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const REPORTS = [
  {
    slug: 'fleet-utilization',
    title: 'Fleet Utilization',
    desc: 'Flight hours, scheduled hours, utilization %, squawk counts per aircraft.',
  },
  {
    slug: 'instructor-utilization',
    title: 'Instructor Utilization',
    desc: 'Scheduled vs flown hours, pass rate, duty-hour warnings per instructor.',
  },
  {
    slug: 'student-progress',
    title: 'Student Progress',
    desc: 'Course progress, hours flown, ahead/behind indicator per student.',
  },
  {
    slug: 'no-show-rate',
    title: 'No-Show Rate',
    desc: 'No-show count and rate per student with school-wide summary.',
  },
  {
    slug: 'squawk-turnaround',
    title: 'Squawk Turnaround',
    desc: 'Open/closed squawk counts and avg resolution time per aircraft.',
  },
  {
    slug: 'course-completion',
    title: 'Course Completion',
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
    <main style={{ padding: '1rem', maxWidth: 1000 }}>
      <h1 style={{ margin: '0 0 1rem' }}>Reports</h1>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: '1rem',
        }}
      >
        {REPORTS.map((r) => (
          <Link
            key={r.slug}
            href={`/admin/reports/${r.slug}`}
            style={{
              padding: '1rem',
              border: '1px solid #e5e7eb',
              borderRadius: 8,
              textDecoration: 'none',
              color: 'inherit',
              background: 'white',
            }}
          >
            <h3 style={{ margin: '0 0 0.25rem', fontSize: '1rem' }}>{r.title}</h3>
            <p style={{ margin: 0, color: '#666', fontSize: '0.8rem' }}>{r.desc}</p>
          </Link>
        ))}
      </div>
    </main>
  );
}
