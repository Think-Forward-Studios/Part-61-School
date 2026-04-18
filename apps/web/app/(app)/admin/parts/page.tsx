/**
 * /admin/parts — parts inventory list (MNT-08).
 */
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { and, eq, isNull } from 'drizzle-orm';
import { db, users, part } from '@part61/db';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/ui';

export const dynamic = 'force-dynamic';

const TH: React.CSSProperties = {
  textAlign: 'left',
  padding: '0.65rem 0.9rem',
  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
  fontSize: '0.68rem',
  letterSpacing: '0.15em',
  color: '#7a869a',
  textTransform: 'uppercase',
  fontWeight: 500,
  borderBottom: '1px solid #1f2940',
};

const TD: React.CSSProperties = {
  padding: '0.7rem 0.9rem',
  color: '#cbd5e1',
  fontSize: '0.82rem',
};

const MONO_TD: React.CSSProperties = {
  ...TD,
  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
  fontSize: '0.76rem',
};

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
    <main style={{ padding: '0 1.5rem 2rem', maxWidth: 1300, margin: '0 auto' }}>
      <PageHeader
        eyebrow="Maintenance"
        title="Parts Inventory"
        subtitle="Every consumable, hardware, overhaul, and life-limited part held in school inventory. Lot / serial tracking lives on each part's detail page."
      />

      {rows.length === 0 ? (
        <div
          style={{
            padding: '3rem 1rem',
            textAlign: 'center',
            color: '#7a869a',
            fontSize: '0.88rem',
            background: '#0d1220',
            border: '1px dashed #1f2940',
            borderRadius: 12,
          }}
        >
          No parts on file.
        </div>
      ) : (
        <div
          style={{
            background: '#0d1220',
            border: '1px solid #1f2940',
            borderRadius: 12,
            overflow: 'hidden',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#121826' }}>
                <th style={TH}>Part #</th>
                <th style={TH}>Description</th>
                <th style={TH}>Kind</th>
                <th style={TH}>On hand</th>
                <th style={TH}>Unit</th>
                <th style={TH}>Supplier</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const onHand = Number(r.onHandQty ?? 0);
                const low = r.minReorderQty != null && onHand <= Number(r.minReorderQty);
                return (
                  <tr key={r.id} style={{ borderBottom: '1px solid #161d30' }}>
                    <td style={TD}>
                      <Link
                        href={`/admin/parts/${r.id}`}
                        style={{
                          color: '#38bdf8',
                          textDecoration: 'none',
                          fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                          fontWeight: 600,
                        }}
                      >
                        {r.partNumber}
                      </Link>
                    </td>
                    <td style={TD}>
                      {r.description ?? <span style={{ color: '#5b6784' }}>—</span>}
                    </td>
                    <td style={MONO_TD}>{r.kind}</td>
                    <td
                      style={{
                        ...MONO_TD,
                        color: low ? '#f87171' : '#cbd5e1',
                        fontWeight: low ? 600 : 400,
                      }}
                    >
                      {onHand.toFixed(2)}
                    </td>
                    <td style={MONO_TD}>{r.unit}</td>
                    <td style={MONO_TD}>
                      {r.preferredSupplier ?? <span style={{ color: '#5b6784' }}>—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
