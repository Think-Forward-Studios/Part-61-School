/**
 * /admin/squawks/[id] — squawk detail with lifecycle action bar.
 *
 * Server fetches the squawk; the client-side SquawkActions component
 * renders the transition buttons based on current status. Role +
 * mechanic_authority enforcement happens server-side in the tRPC
 * router; the UI hides buttons the caller can't use.
 */
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { and, eq, sql } from 'drizzle-orm';
import { db, users, aircraftSquawk, aircraft } from '@part61/db';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { SquawkActions } from './SquawkActions';
import { PageHeader } from '@/components/ui';

export const dynamic = 'force-dynamic';

type Params = Promise<{ id: string }>;

export default async function SquawkDetailPage({ params }: { params: Params }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const me = (await db.select().from(users).where(eq(users.id, user.id)).limit(1))[0];
  if (!me?.schoolId) redirect('/login');

  const sq = (
    await db
      .select()
      .from(aircraftSquawk)
      .where(and(eq(aircraftSquawk.id, id), eq(aircraftSquawk.schoolId, me.schoolId)))
      .limit(1)
  )[0];
  if (!sq) notFound();

  const ac = (await db.select().from(aircraft).where(eq(aircraft.id, sq.aircraftId)).limit(1))[0];

  // Detect user mechanic authority to drive UI affordance.
  const authRows = (await db.execute(sql`
    select max(mechanic_authority::text) as auth
      from public.user_roles
     where user_id = ${user.id}::uuid
       and mechanic_authority in ('a_and_p','ia')
  `)) as unknown as Array<{ auth: string | null }>;
  const userAuthority = (authRows[0]?.auth ?? null) as 'a_and_p' | 'ia' | null;

  return (
    <main style={{ padding: '0 1.5rem 2rem', maxWidth: 1300, margin: '0 auto' }}>
      <div style={{ marginBottom: '0.5rem' }}>
        <Link
          href="/admin/squawks"
          style={{
            color: '#38bdf8',
            textDecoration: 'none',
            fontSize: '0.78rem',
            fontFamily: '"JetBrains Mono", ui-monospace, monospace',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          ← Back to squawks
        </Link>
      </div>
      <PageHeader
        eyebrow="Maintenance"
        title={sq.title}
        subtitle={
          <>
            Aircraft:{' '}
            <Link
              href={`/admin/aircraft/${sq.aircraftId}`}
              style={{ color: '#38bdf8', textDecoration: 'none' }}
            >
              {ac?.tailNumber ?? '—'}
            </Link>
            {' · '}Severity: <strong style={{ color: '#f7f9fc' }}>{sq.severity}</strong>
            {' · '}Status: <strong style={{ color: '#f7f9fc' }}>{sq.status}</strong>
          </>
        }
      />

      {sq.description ? (
        <section
          style={{
            padding: '0.85rem 1rem',
            background: '#0d1220',
            border: '1px solid #1f2940',
            borderRadius: 12,
            marginTop: '0.5rem',
          }}
        >
          <pre
            style={{
              whiteSpace: 'pre-wrap',
              margin: 0,
              fontSize: '0.85rem',
              color: '#cbd5e1',
              fontFamily: '"JetBrains Mono", ui-monospace, monospace',
            }}
          >
            {sq.description}
          </pre>
        </section>
      ) : null}

      <section
        style={{
          marginTop: '1rem',
          padding: '1rem 1.25rem',
          background: '#0d1220',
          border: '1px solid #1f2940',
          borderRadius: 12,
        }}
      >
        <h2
          style={{
            margin: '0 0 0.5rem 0',
            fontSize: '0.95rem',
            color: '#f7f9fc',
          }}
        >
          Timeline
        </h2>
        <ul
          style={{
            margin: 0,
            paddingLeft: '1.25rem',
            fontSize: '0.85rem',
            color: '#cbd5e1',
          }}
        >
          <li>Opened {new Date(sq.openedAt).toLocaleString()}</li>
          {sq.triagedAt ? <li>Triaged {new Date(sq.triagedAt).toLocaleString()}</li> : null}
          {sq.deferredUntil ? (
            <li>
              Deferred until {sq.deferredUntil} — {sq.deferralJustification ?? ''}
            </li>
          ) : null}
          {sq.returnedToServiceAt ? (
            <li>Returned to service {new Date(sq.returnedToServiceAt).toLocaleString()}</li>
          ) : null}
          {sq.resolvedAt ? <li>Resolved {new Date(sq.resolvedAt).toLocaleString()}</li> : null}
        </ul>
      </section>

      <SquawkActions squawkId={sq.id} status={sq.status} userAuthority={userAuthority} />
    </main>
  );
}
