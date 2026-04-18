/**
 * /admin/maintenance-templates — list system + school templates.
 */
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { sql, eq } from 'drizzle-orm';
import { db, users } from '@part61/db';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/ui';

export const dynamic = 'force-dynamic';

type Row = {
  id: string;
  school_id: string | null;
  name: string;
  aircraft_make: string | null;
  aircraft_model_pattern: string | null;
  description: string | null;
  line_count: number;
};

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

export default async function MaintenanceTemplatesPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const me = (await db.select().from(users).where(eq(users.id, user.id)).limit(1))[0];
  if (!me?.schoolId) redirect('/login');

  const rows = (await db.execute(sql`
    select
      t.id,
      t.school_id,
      t.name,
      t.aircraft_make,
      t.aircraft_model_pattern,
      t.description,
      (select count(*)::int
         from public.maintenance_item_template_line l
         where l.template_id = t.id) as line_count
    from public.maintenance_item_template t
    where (t.school_id is null or t.school_id = ${me.schoolId}::uuid)
      and t.deleted_at is null
    order by t.school_id nulls first, t.name
  `)) as unknown as Row[];

  return (
    <main style={{ padding: '0 1.5rem 2rem', maxWidth: 1200, margin: '0 auto' }}>
      <PageHeader
        eyebrow="Maintenance"
        title="Templates"
        subtitle="Reusable item bundles that can be applied to a new aircraft. System templates (unscoped) cover common airframes; school-scoped templates are yours."
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
          No templates available.
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
                <th style={TH}>Name</th>
                <th style={TH}>Scope</th>
                <th style={TH}>Applicable to</th>
                <th style={TH}>Items</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} style={{ borderBottom: '1px solid #161d30' }}>
                  <td style={{ ...TD, color: '#f7f9fc', fontWeight: 500 }}>{r.name}</td>
                  <td style={TD}>
                    {r.school_id == null ? (
                      <span
                        style={{
                          display: 'inline-flex',
                          padding: '0.15rem 0.55rem',
                          borderRadius: 999,
                          background: 'rgba(122, 134, 154, 0.14)',
                          color: '#7a869a',
                          fontSize: '0.68rem',
                          fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                          letterSpacing: '0.1em',
                          textTransform: 'uppercase',
                          fontWeight: 600,
                        }}
                      >
                        System
                      </span>
                    ) : (
                      <span
                        style={{
                          display: 'inline-flex',
                          padding: '0.15rem 0.55rem',
                          borderRadius: 999,
                          background: 'rgba(56, 189, 248, 0.12)',
                          color: '#38bdf8',
                          fontSize: '0.68rem',
                          fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                          letterSpacing: '0.1em',
                          textTransform: 'uppercase',
                          fontWeight: 600,
                        }}
                      >
                        School
                      </span>
                    )}
                  </td>
                  <td
                    style={{
                      ...TD,
                      fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                      fontSize: '0.76rem',
                    }}
                  >
                    {[r.aircraft_make, r.aircraft_model_pattern].filter(Boolean).join(' / ') || (
                      <span style={{ color: '#5b6784' }}>Any</span>
                    )}
                  </td>
                  <td
                    style={{
                      ...TD,
                      fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                      fontSize: '0.78rem',
                      color: '#f7f9fc',
                    }}
                  >
                    {r.line_count}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p style={{ color: '#7a869a', fontSize: '0.78rem', marginTop: '1rem' }}>
        <Link href="/admin/aircraft" style={{ color: '#38bdf8', textDecoration: 'none' }}>
          Apply a template to an aircraft →
        </Link>
      </p>
    </main>
  );
}
