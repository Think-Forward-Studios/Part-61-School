import Link from 'next/link';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db, users } from '@part61/db';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { CreateFifForm } from './CreateFifForm';
import { PageHeader } from '@/components/ui';

export const dynamic = 'force-dynamic';

const BACK_LINK: React.CSSProperties = {
  display: 'inline-block',
  color: '#7a869a',
  textDecoration: 'none',
  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
  fontSize: '0.72rem',
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  marginBottom: '0.75rem',
};

export default async function NewFifPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const me = (await db.select().from(users).where(eq(users.id, user.id)).limit(1))[0];
  if (!me) redirect('/login');

  return (
    <main style={{ padding: '0 1.5rem 2rem', maxWidth: 1300, margin: '0 auto' }}>
      <Link href="/admin/fif" style={BACK_LINK}>
        ← Notices
      </Link>
      <PageHeader
        eyebrow="Training"
        title="Post Notice"
        subtitle="All pilots must acknowledge active notices before they can dispatch a flight. Keep the title short; keep the body focused on a single safety item."
      />
      <CreateFifForm />
    </main>
  );
}
