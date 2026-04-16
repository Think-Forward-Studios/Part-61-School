import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { StudentDashboard } from './_components/StudentDashboard';
import { InstructorDashboard } from './_components/InstructorDashboard';
import { MechanicDashboard } from './_components/MechanicDashboard';

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

  return (
    <main style={{ padding: '1rem', maxWidth: 1200 }}>
      <h1 style={{ margin: '0 0 1rem' }}>Dashboard</h1>
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
