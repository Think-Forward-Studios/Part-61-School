import { redirect } from 'next/navigation';
import { eq, isNull, sql } from 'drizzle-orm';
import { db, users, endorsementTemplate } from '@part61/db';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function EndorsementsPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const me = (await db.select().from(users).where(eq(users.id, user.id)).limit(1))[0];
  if (!me?.schoolId) redirect('/login');

  const templates = await db
    .select()
    .from(endorsementTemplate)
    .where(isNull(endorsementTemplate.deletedAt));

  const recent = (await db.execute(sql`
    select se.id, se.rendered_text, se.issued_at, se.sealed_at, se.revoked_at, se.expires_at,
      coalesce(nullif(trim(concat_ws(' ', pp.first_name, pp.last_name)), ''), u.full_name, u.email) as student_name,
      et.code as template_code, et.title as template_title, et.category
    from public.student_endorsement se
    join public.users u on u.id = se.student_user_id
    left join public.person_profile pp on pp.user_id = u.id
    left join public.endorsement_template et on et.id = se.template_id
    where se.school_id = ${me.schoolId}::uuid and se.deleted_at is null
    order by se.issued_at desc
    limit 25
  `)) as unknown as Array<{
    id: string;
    rendered_text: string;
    issued_at: string;
    sealed_at: string | null;
    revoked_at: string | null;
    expires_at: string | null;
    student_name: string | null;
    template_code: string | null;
    template_title: string | null;
    category: string | null;
  }>;

  // Group templates by category
  const grouped = new Map<string, typeof templates>();
  for (const t of templates) {
    const arr = grouped.get(t.category) ?? [];
    arr.push(t);
    grouped.set(t.category, arr);
  }

  return (
    <main style={{ padding: '1rem', maxWidth: 1000 }}>
      <h1>Endorsements</h1>
      <p style={{ color: '#555', fontSize: '0.85rem' }}>
        AC 61-65K template catalog + recently issued endorsements.
      </p>

      <section style={{ marginTop: '1.5rem' }}>
        <h2>Template catalog</h2>
        {templates.length === 0 ? (
          <p style={{ color: '#888' }}>No endorsement templates seeded.</p>
        ) : (
          [...grouped.entries()].map(([cat, rows]) => (
            <details key={cat} open>
              <summary style={{ padding: '0.5rem', background: '#f3f4f6', cursor: 'pointer' }}>
                <strong>{cat.replace(/_/g, ' ')}</strong> ({rows.length})
              </summary>
              <ul style={{ listStyle: 'none', paddingLeft: '1rem' }}>
                {rows.map((t) => (
                  <li key={t.id} style={{ padding: '0.25rem 0' }}>
                    <code>{t.code}</code> — {t.title}
                    {t.acReference ? (
                      <span style={{ color: '#888', fontSize: '0.8rem' }}>
                        {' '}
                        · {t.acReference}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </details>
          ))
        )}
      </section>

      <section style={{ marginTop: '2rem' }}>
        <h2>Recently issued</h2>
        {recent.length === 0 ? (
          <p style={{ color: '#888' }}>No endorsements issued yet.</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {recent.map((r) => (
              <li
                key={r.id}
                style={{
                  padding: '0.75rem',
                  borderBottom: '1px solid #eee',
                  marginBottom: '0.5rem',
                }}
              >
                <div>
                  <strong>{r.student_name ?? '—'}</strong> · {r.template_code} ·{' '}
                  <span style={{ fontSize: '0.8rem', color: '#555' }}>
                    {new Date(r.issued_at).toLocaleDateString()}
                  </span>
                  {r.sealed_at ? (
                    <span
                      style={{
                        marginLeft: '0.5rem',
                        fontSize: '0.75rem',
                        padding: '0.1rem 0.4rem',
                        borderRadius: 3,
                        background: '#dcfce7',
                      }}
                    >
                      sealed
                    </span>
                  ) : null}
                  {r.revoked_at ? (
                    <span
                      style={{
                        marginLeft: '0.5rem',
                        fontSize: '0.75rem',
                        padding: '0.1rem 0.4rem',
                        borderRadius: 3,
                        background: '#fee2e2',
                      }}
                    >
                      revoked
                    </span>
                  ) : null}
                </div>
                <pre
                  style={{
                    whiteSpace: 'pre-wrap',
                    fontFamily: 'inherit',
                    fontSize: '0.85rem',
                    margin: '0.25rem 0 0',
                    color: '#333',
                  }}
                >
                  {r.rendered_text}
                </pre>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
