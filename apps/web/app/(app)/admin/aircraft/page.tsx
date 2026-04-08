import Link from 'next/link';
import { and, eq, isNull } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { db, users, aircraft } from '@part61/db';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { AircraftTable } from './AircraftTable';

export const dynamic = 'force-dynamic';

export default async function AdminAircraftPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const me = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  const schoolId = me[0]?.schoolId;
  if (!schoolId) redirect('/login');

  const rows = await db
    .select({
      id: aircraft.id,
      tailNumber: aircraft.tailNumber,
      make: aircraft.make,
      model: aircraft.model,
      year: aircraft.year,
      baseId: aircraft.baseId,
    })
    .from(aircraft)
    .where(and(eq(aircraft.schoolId, schoolId), isNull(aircraft.deletedAt)));

  return (
    <main style={{ padding: '1rem', maxWidth: 1200 }}>
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <h1>Fleet</h1>
        <Link
          href="/admin/aircraft/new"
          style={{
            padding: '0.5rem 1rem',
            background: '#0070f3',
            color: 'white',
            borderRadius: 4,
            textDecoration: 'none',
          }}
        >
          + New Aircraft
        </Link>
      </header>
      <AircraftTable rows={rows} />
    </main>
  );
}
