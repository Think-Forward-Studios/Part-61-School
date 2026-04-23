import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { db, schools, users } from '@part61/db';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { CreateAircraftForm } from './CreateAircraftForm';
import { PageHeader } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function NewAircraftPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const me = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  const schoolId = me[0]?.schoolId;
  if (!schoolId) redirect('/login');

  // Preload the school's home airport so the Home Airfield field on
  // the form can use it as a placeholder. Leaving the field blank on
  // save means "inherit from school"; typing something overrides for
  // this specific tail.
  const schoolRow = (
    await db
      .select({
        homeBaseAirport: schools.homeBaseAirport,
        homeBaseAirportName: schools.homeBaseAirportName,
      })
      .from(schools)
      .where(eq(schools.id, schoolId))
      .limit(1)
  )[0];

  return (
    <main style={{ padding: '0 1.5rem 2rem', maxWidth: 1300, margin: '0 auto' }}>
      <PageHeader
        eyebrow="Maintenance"
        title="Add Aircraft"
        subtitle="Creates the aircraft, attaches an initial engine, records a baseline flight-log entry with the clocks you enter, and saves the equipment tags in one shot."
      />
      <CreateAircraftForm
        schoolHomeAirport={schoolRow?.homeBaseAirport?.trim() || null}
        schoolHomeAirportName={schoolRow?.homeBaseAirportName?.trim() || null}
      />
    </main>
  );
}
