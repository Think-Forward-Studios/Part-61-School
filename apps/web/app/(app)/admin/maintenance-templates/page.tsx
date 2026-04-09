/**
 * /admin/maintenance-templates — list system + school templates.
 */
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { sql, eq } from 'drizzle-orm';
import { db, users } from '@part61/db';
import { createSupabaseServerClient } from '@/lib/supabase/server';

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
    <main style={{ padding: '1rem', maxWidth: 1100 }}>
      <h1>Maintenance Templates</h1>
      <p style={{ color: '#6b7280', fontSize: '0.85rem' }}>
        Reusable item bundles that can be applied to a new aircraft. System templates
        (unscoped) cover common airframes; school-scoped templates are yours.
      </p>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
        <thead>
          <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
            <th style={{ padding: '0.4rem' }}>Name</th>
            <th style={{ padding: '0.4rem' }}>Scope</th>
            <th style={{ padding: '0.4rem' }}>Applicable to</th>
            <th style={{ padding: '0.4rem' }}>Items</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} style={{ borderBottom: '1px solid #eee' }}>
              <td style={{ padding: '0.4rem' }}>{r.name}</td>
              <td style={{ padding: '0.4rem' }}>
                {r.school_id == null ? (
                  <span style={{ color: '#6b7280' }}>System</span>
                ) : (
                  <span style={{ color: '#0369a1' }}>School</span>
                )}
              </td>
              <td style={{ padding: '0.4rem', fontSize: '0.8rem' }}>
                {[r.aircraft_make, r.aircraft_model_pattern].filter(Boolean).join(' / ') ||
                  'Any'}
              </td>
              <td style={{ padding: '0.4rem' }}>{r.line_count}</td>
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr>
              <td colSpan={4} style={{ padding: '0.75rem', color: '#6b7280' }}>
                No templates available.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
      <p style={{ color: '#6b7280', fontSize: '0.8rem', marginTop: '1rem' }}>
        <Link href="/admin/aircraft">Apply a template to an aircraft →</Link>
      </p>
    </main>
  );
}
