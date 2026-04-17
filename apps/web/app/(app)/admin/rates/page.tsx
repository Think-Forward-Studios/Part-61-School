import { cookies } from 'next/headers';
import { redirect, notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { RateEditor } from './_components/RateEditor';
import { PageHeader } from '@/components/ui';

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
    <main style={{ padding: '0 1.5rem 2rem', maxWidth: 1100, margin: '0 auto' }}>
      <PageHeader
        eyebrow="Billing"
        title="Rate Configuration"
        subtitle="Per-hour rates for billable time. Changes take effect for new flights — historical cost uses the rate effective at flight time."
      />
      <RateEditor />
    </main>
  );
}
