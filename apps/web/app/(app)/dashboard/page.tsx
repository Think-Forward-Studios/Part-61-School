import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { StudentDashboard } from './_components/StudentDashboard';
import { InstructorDashboard } from './_components/InstructorDashboard';
import { MechanicDashboard } from './_components/MechanicDashboard';
import { PageHeader } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const cookieStore = await cookies();
  const activeRole = cookieStore.get('part61.active_role')?.value;
  if (activeRole === 'admin') redirect('/admin/dashboard');

  const subtitle =
    activeRole === 'instructor'
      ? 'Today\u2019s assignments, pending approvals, and student workload at a glance.'
      : activeRole === 'mechanic'
        ? 'Open squawks, work orders, and the fleet maintenance forecast.'
        : 'Your next reservation, syllabus progress, and currency status.';

  return (
    <main style={{ padding: '0 1.5rem 2rem', maxWidth: 1200, margin: '0 auto' }}>
      <PageHeader eyebrow="Home" title="Dashboard" subtitle={subtitle} />
      {activeRole === 'instructor' ? (
        <InstructorDashboard />
      ) : activeRole === 'mechanic' ? (
        <MechanicDashboard />
      ) : (
        <StudentDashboard />
      )}
    </main>
  );
}
