/**
 * /admin/parts — parts inventory list (MNT-08).
 */
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { and, eq, isNull } from 'drizzle-orm';
import { db, users, part } from '@part61/db';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function AdminPartsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const me = (await db.select().from(users).where(eq(users.id, user.id)).limit(1))[0];
  if (!me?.schoolId) redirect('/login');

  const rows = await db
    .select()
    .from(part)
    .where(and(eq(part.schoolId, me.schoolId), isNull(part.deletedAt)));

  return (
    <main style={{ padding: '1rem', maxWidth: 1100 }}>
      <h1>Parts Inventory</h1>
      <p style={{ color: '#6b7280', fontSize: '0.85rem' }}>
        Every consumable, hardware, overhaul, and life-limited part held in school
        inventory. Lot / serial tracking lives on each part&apos;s detail page.
      </p>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
        <thead>
          <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
            <th style={{ padding: '0.4rem' }}>Part #</th>
            <th style={{ padding: '0.4rem' }}>Description</th>
            <th style={{ padding: '0.4rem' }}>Kind</th>
            <th style={{ padding: '0.4rem' }}>On hand</th>
            <th style={{ padding: '0.4rem' }}>Unit</th>
            <th style={{ padding: '0.4rem' }}>Supplier</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const onHand = Number(r.onHandQty ?? 0);
            const low = r.minReorderQty != null && onHand <= Number(r.minReorderQty);
            return (
              <tr key={r.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '0.4rem' }}>
                  <Link href={`/admin/parts/${r.id}`}>{r.partNumber}</Link>
                </td>
                <td style={{ padding: '0.4rem' }}>{r.description ?? '—'}</td>
                <td style={{ padding: '0.4rem', fontSize: '0.8rem' }}>{r.kind}</td>
                <td
                  style={{
                    padding: '0.4rem',
                    color: low ? '#b91c1c' : '#1f2937',
                    fontWeight: low ? 600 : 400,
                  }}
                >
                  {onHand.toFixed(2)}
                </td>
                <td style={{ padding: '0.4rem', fontSize: '0.8rem' }}>{r.unit}</td>
                <td style={{ padding: '0.4rem', fontSize: '0.8rem' }}>
                  {r.preferredSupplier ?? '—'}
                </td>
              </tr>
            );
          })}
          {rows.length === 0 ? (
            <tr>
              <td colSpan={6} style={{ padding: '0.75rem', color: '#6b7280' }}>
                No parts on file.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </main>
  );
}
