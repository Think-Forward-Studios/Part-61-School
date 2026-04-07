import { createSupabaseServerClient } from '@/lib/supabase/server';

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return (
    <main style={{ padding: '1rem' }}>
      <h1>Part 61 School</h1>
      <p>Signed in as {user?.email ?? 'unknown'}.</p>
      <p>Foundation is live.</p>
    </main>
  );
}
