import { cookies } from 'next/headers';
import { redirect, notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { RateEditor } from './_components/RateEditor';

export const dynamic = 'force-dynamic';

export default async function RatesPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const cookieStore = await cookies();
  const activeRole = cookieStore.get('part61.active_role')?.value;
  if (activeRole !== 'admin') notFound();

  return (
    <main style={{ padding: '1rem', maxWidth: 1000 }}>
      <h1 style={{ margin: '0 0 1rem' }}>Rate Configuration</h1>
      <p style={{ color: '#666', marginBottom: '1rem', fontSize: '0.85rem' }}>
        Configure per-hour billing rates. Changes take effect immediately for new flights.
        Historical cost calculations use the rate effective at flight time.
      </p>
      <RateEditor />
    </main>
  );
}
