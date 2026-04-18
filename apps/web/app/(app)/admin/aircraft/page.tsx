import Link from 'next/link';
import { and, eq, isNull } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { db, users, aircraft } from '@part61/db';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { AircraftTable } from './AircraftTable';
import { PageHeader } from '@/components/ui';

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
    <main style={{ padding: '0 1.5rem 2rem', maxWidth: 1300, margin: '0 auto' }}>
      <PageHeader
        eyebrow="Maintenance"
        title="Fleet"
        subtitle={`${rows.length} ${rows.length === 1 ? 'aircraft' : 'aircraft'} on the line.`}
        actions={
          <Link
            href="/admin/aircraft/new"
            style={{
              padding: '0.55rem 0.95rem',
              background: 'linear-gradient(180deg, #fbbf24 0%, #f59e0b 100%)',
              color: '#0a0e1a',
              borderRadius: 8,
              textDecoration: 'none',
              fontSize: '0.78rem',
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              boxShadow:
                '0 4px 14px rgba(251, 191, 36, 0.25), 0 1px 0 rgba(255, 255, 255, 0.15) inset',
            }}
          >
            + New Aircraft
          </Link>
        }
      />
      <AircraftTable rows={rows} />
    </main>
  );
}
