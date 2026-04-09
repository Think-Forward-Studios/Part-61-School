/**
 * /admin/ads — Airworthiness Directive catalog list (MNT-07).
 */
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { and, eq, isNull, or } from 'drizzle-orm';
import { db, users, airworthinessDirective } from '@part61/db';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ApplyAdToFleetButton } from './ApplyAdToFleetButton';

export const dynamic = 'force-dynamic';

export default async function AdminAdsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const me = (await db.select().from(users).where(eq(users.id, user.id)).limit(1))[0];
  if (!me?.schoolId) redirect('/login');

  const rows = await db
    .select()
    .from(airworthinessDirective)
    .where(
      and(
        isNull(airworthinessDirective.deletedAt),
        or(
          isNull(airworthinessDirective.schoolId),
          eq(airworthinessDirective.schoolId, me.schoolId),
        ),
      ),
    );

  return (
    <main style={{ padding: '1rem', maxWidth: 1200 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Airworthiness Directives</h1>
      </header>
      <p style={{ color: '#6b7280', fontSize: '0.85rem' }}>
        Catalog of ADs applicable to this school&apos;s fleet. Use &quot;Apply to fleet&quot;
        to compute per-aircraft compliance rows after editing applicability.
      </p>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
        <thead>
          <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
            <th style={{ padding: '0.4rem' }}>AD Number</th>
            <th style={{ padding: '0.4rem' }}>Title</th>
            <th style={{ padding: '0.4rem' }}>Effective</th>
            <th style={{ padding: '0.4rem' }}>Method</th>
            <th style={{ padding: '0.4rem' }}></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} style={{ borderBottom: '1px solid #eee' }}>
              <td style={{ padding: '0.4rem' }}>
                <Link href={`/admin/ads/${r.id}`}>{r.adNumber}</Link>
              </td>
              <td style={{ padding: '0.4rem' }}>{r.title}</td>
              <td style={{ padding: '0.4rem', fontSize: '0.8rem' }}>
                {r.effectiveDate ?? '—'}
              </td>
              <td style={{ padding: '0.4rem', fontSize: '0.8rem' }}>
                {r.complianceMethod ?? '—'}
              </td>
              <td style={{ padding: '0.4rem' }}>
                <ApplyAdToFleetButton adId={r.id} />
              </td>
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr>
              <td colSpan={5} style={{ padding: '0.75rem', color: '#6b7280' }}>
                No ADs in the catalog yet.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </main>
  );
}
