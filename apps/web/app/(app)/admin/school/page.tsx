import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { db, users, schools } from '@part61/db';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { SchoolSettingsForm } from './SchoolSettingsForm';

export const dynamic = 'force-dynamic';

export default async function SchoolSettingsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const me = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  const schoolId = me[0]?.schoolId;
  if (!schoolId) redirect('/login');

  const rows = await db.select().from(schools).where(eq(schools.id, schoolId)).limit(1);
  const school = rows[0];
  if (!school) redirect('/login');

  return (
    <main style={{ padding: '1rem', maxWidth: 720 }}>
      <h1>School Settings</h1>
      <SchoolSettingsForm initial={{ name: school.name, timezone: school.timezone }} />
    </main>
  );
}
