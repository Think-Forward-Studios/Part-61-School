import Link from 'next/link';
import { and, eq, isNull } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { db, users, scheduleBlock } from '@part61/db';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { BlockActions } from './BlockActions';
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

export default async function AdminBlocksPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const me = (await db.select().from(users).where(eq(users.id, user.id)).limit(1))[0];
  if (!me) redirect('/login');

  const rows = await db
    .select()
    .from(scheduleBlock)
    .where(and(eq(scheduleBlock.schoolId, me.schoolId), isNull(scheduleBlock.deletedAt)));

  const dash = <span style={{ color: '#5b6784' }}>—</span>;

  return (
    <main style={{ padding: '0 1.5rem 2rem', maxWidth: 1200, margin: '0 auto' }}>
      <PageHeader
        eyebrow="Scheduling"
        title="Blocks"
        subtitle={`${rows.length} ${rows.length === 1 ? 'block' : 'blocks'} — recurring unavailable windows.`}
        actions={
          <Link
            href="/admin/blocks/new"
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
            + New block
          </Link>
        }
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
          No blocks yet.
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
                <th style={TH}>Kind</th>
                <th style={TH}>Instructor</th>
                <th style={TH}>Aircraft</th>
                <th style={TH}>Room</th>
                <th style={TH}>Notes</th>
                <th style={TH}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.id} style={{ borderBottom: '1px solid #161d30' }}>
                  <td style={TD}>{b.kind}</td>
                  <td style={MONO_TD}>{b.instructorId ?? dash}</td>
                  <td style={MONO_TD}>{b.aircraftId ?? dash}</td>
                  <td style={MONO_TD}>{b.roomId ?? dash}</td>
                  <td style={TD}>{b.notes ?? ''}</td>
                  <td style={{ padding: '0.7rem 0.9rem' }}>
                    <BlockActions blockId={b.id} />
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
