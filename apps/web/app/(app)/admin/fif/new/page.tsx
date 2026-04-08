import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db, users } from '@part61/db';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { CreateFifForm } from './CreateFifForm';

export const dynamic = 'force-dynamic';

export default async function NewFifPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const me = (await db.select().from(users).where(eq(users.id, user.id)).limit(1))[0];
  if (!me) redirect('/login');

  return (
    <main style={{ padding: '1rem', maxWidth: 720 }}>
      <h1>Post Flight Information File notice</h1>
      <p style={{ color: '#6b7280', fontSize: '0.85rem' }}>
        All pilots must acknowledge active notices before they can dispatch a flight. Keep the title
        short; keep the body focused on a single safety item.
      </p>
      <CreateFifForm />
    </main>
  );
}
