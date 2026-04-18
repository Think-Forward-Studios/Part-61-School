import { redirect } from 'next/navigation';
import { eq, isNull, sql } from 'drizzle-orm';
import { db, users, endorsementTemplate } from '@part61/db';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/ui';

export const dynamic = 'force-dynamic';

const SECTION_HEADING: React.CSSProperties = {
  margin: '0 0 0.75rem',
  fontFamily: '"Antonio", system-ui, sans-serif',
  fontSize: '1.05rem',
  letterSpacing: '0.02em',
  color: '#f7f9fc',
  textTransform: 'uppercase',
  fontWeight: 600,
};

const EMPTY: React.CSSProperties = {
  padding: '2.5rem 1rem',
  textAlign: 'center',
  color: '#7a869a',
  fontSize: '0.88rem',
  background: '#0d1220',
  border: '1px dashed #1f2940',
  borderRadius: 12,
};

const CHIP = (bg: string, fg: string, border: string): React.CSSProperties => ({
  marginLeft: '0.5rem',
  fontSize: '0.66rem',
  padding: '0.1rem 0.45rem',
  borderRadius: 999,
  background: bg,
  color: fg,
  border: `1px solid ${border}`,
  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  fontWeight: 600,
});

const CHIP_SEALED = CHIP('rgba(52, 211, 153, 0.12)', '#34d399', 'rgba(52, 211, 153, 0.35)');
const CHIP_REVOKED = CHIP('rgba(248, 113, 113, 0.14)', '#f87171', 'rgba(248, 113, 113, 0.35)');

export default async function EndorsementsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
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
    <main style={{ padding: '0 1.5rem 2rem', maxWidth: 1300, margin: '0 auto' }}>
      <PageHeader
        eyebrow="Training"
        title="Endorsements"
        subtitle="AC 61-65K template catalog + recently issued endorsements."
      />

      <section style={{ marginTop: '0.5rem' }}>
        <h2 style={SECTION_HEADING}>Template catalog</h2>
        {templates.length === 0 ? (
          <div style={EMPTY}>No endorsement templates seeded.</div>
        ) : (
          <div
            style={{
              background: '#0d1220',
              border: '1px solid #1f2940',
              borderRadius: 12,
              padding: '0.75rem 1rem',
            }}
          >
            {[...grouped.entries()].map(([cat, rows]) => (
              <details key={cat} open style={{ margin: '0.35rem 0' }}>
                <summary
                  style={{
                    padding: '0.4rem 0.6rem',
                    background: '#121826',
                    border: '1px solid #1f2940',
                    borderRadius: 6,
                    cursor: 'pointer',
                    color: '#f7f9fc',
                    listStyle: 'none',
                  }}
                >
                  <strong style={{ textTransform: 'capitalize' }}>{cat.replace(/_/g, ' ')}</strong>{' '}
                  <span style={{ color: '#7a869a', fontSize: '0.8rem' }}>({rows.length})</span>
                </summary>
                <ul style={{ listStyle: 'none', paddingLeft: '1rem', margin: '0.4rem 0' }}>
                  {rows.map((t) => (
                    <li
                      key={t.id}
                      style={{ padding: '0.2rem 0', color: '#cbd5e1', fontSize: '0.85rem' }}
                    >
                      <code
                        style={{
                          fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                          color: '#38bdf8',
                        }}
                      >
                        {t.code}
                      </code>{' '}
                      — {t.title}
                      {t.acReference ? (
                        <span style={{ color: '#7a869a', fontSize: '0.78rem' }}>
                          {' '}
                          · {t.acReference}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </div>
        )}
      </section>

      <section style={{ marginTop: '2rem' }}>
        <h2 style={SECTION_HEADING}>Recently issued</h2>
        {recent.length === 0 ? (
          <div style={EMPTY}>No endorsements issued yet.</div>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {recent.map((r) => (
              <li
                key={r.id}
                style={{
                  padding: '0.85rem 1rem',
                  background: '#0d1220',
                  border: '1px solid #1f2940',
                  borderRadius: 10,
                  marginBottom: '0.6rem',
                }}
              >
                <div style={{ color: '#cbd5e1', fontSize: '0.85rem' }}>
                  <strong style={{ color: '#f7f9fc' }}>{r.student_name ?? '—'}</strong>
                  {' · '}
                  <span
                    style={{
                      fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                      color: '#38bdf8',
                    }}
                  >
                    {r.template_code}
                  </span>
                  {' · '}
                  <span style={{ color: '#7a869a', fontSize: '0.78rem' }}>
                    {new Date(r.issued_at).toLocaleDateString()}
                  </span>
                  {r.sealed_at ? <span style={CHIP_SEALED}>sealed</span> : null}
                  {r.revoked_at ? <span style={CHIP_REVOKED}>revoked</span> : null}
                </div>
                <pre
                  style={{
                    whiteSpace: 'pre-wrap',
                    fontFamily: 'inherit',
                    fontSize: '0.85rem',
                    margin: '0.4rem 0 0',
                    color: '#cbd5e1',
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
