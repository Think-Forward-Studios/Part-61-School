/**
 * /admin/ads — Airworthiness Directive catalog list (MNT-07).
 */
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { and, eq, isNull, or } from 'drizzle-orm';
import { db, users, airworthinessDirective } from '@part61/db';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ApplyAdToFleetButton } from './ApplyAdToFleetButton';
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
    <main style={{ padding: '0 1.5rem 2rem', maxWidth: 1300, margin: '0 auto' }}>
      <PageHeader
        eyebrow="Maintenance"
        title="Airworthiness Directives"
        subtitle={`Catalog of ADs applicable to this school's fleet. Use "Apply to fleet" to compute per-aircraft compliance rows after editing applicability.`}
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
          No ADs in the catalog yet.
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
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ background: '#121826' }}>
                <th style={TH}>AD Number</th>
                <th style={TH}>Title</th>
                <th style={TH}>Effective</th>
                <th style={TH}>Method</th>
                <th style={TH}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} style={{ borderBottom: '1px solid #161d30' }}>
                  <td style={TD}>
                    <Link
                      href={`/admin/ads/${r.id}`}
                      style={{
                        color: '#38bdf8',
                        fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                        fontSize: '0.78rem',
                        textDecoration: 'none',
                      }}
                    >
                      {r.adNumber}
                    </Link>
                  </td>
                  <td style={{ ...TD, color: '#f7f9fc' }}>{r.title}</td>
                  <td
                    style={{
                      ...TD,
                      fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                      fontSize: '0.76rem',
                    }}
                  >
                    {r.effectiveDate ?? <span style={{ color: '#5b6784' }}>—</span>}
                  </td>
                  <td
                    style={{
                      ...TD,
                      fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                      fontSize: '0.76rem',
                    }}
                  >
                    {r.complianceMethod ?? <span style={{ color: '#5b6784' }}>—</span>}
                  </td>
                  <td style={{ padding: '0.5rem 0.9rem', textAlign: 'right' }}>
                    <ApplyAdToFleetButton adId={r.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
