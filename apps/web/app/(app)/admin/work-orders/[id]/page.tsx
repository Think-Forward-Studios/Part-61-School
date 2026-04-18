/**
 * /admin/work-orders/[id] — WO detail with tasks, parts, sign-off.
 */
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { and, eq, isNull, sql } from 'drizzle-orm';
import {
  db,
  users,
  workOrder,
  workOrderTask,
  workOrderPartConsumption,
  aircraft,
} from '@part61/db';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { WorkOrderTasks } from './WorkOrderTasks';
import { SignOffCeremony } from './SignOffCeremony';
import { PageHeader } from '@/components/ui';

export const dynamic = 'force-dynamic';

type Params = Promise<{ id: string }>;

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

export default async function WorkOrderDetailPage({ params }: { params: Params }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const me = (await db.select().from(users).where(eq(users.id, user.id)).limit(1))[0];
  if (!me?.schoolId) redirect('/login');

  const wo = (
    await db
      .select()
      .from(workOrder)
      .where(and(eq(workOrder.id, id), eq(workOrder.schoolId, me.schoolId)))
      .limit(1)
  )[0];
  if (!wo) notFound();

  const ac = (await db.select().from(aircraft).where(eq(aircraft.id, wo.aircraftId)).limit(1))[0];

  const tasks = await db
    .select()
    .from(workOrderTask)
    .where(and(eq(workOrderTask.workOrderId, wo.id), isNull(workOrderTask.deletedAt)));

  const consumption = await db
    .select()
    .from(workOrderPartConsumption)
    .where(eq(workOrderPartConsumption.workOrderId, wo.id));

  // Highest required authority among tasks.
  const authOrder: Record<string, number> = { none: 0, a_and_p: 1, ia: 2 };
  let highest = 'a_and_p';
  for (const t of tasks) {
    const a = (t.requiredAuthority as string) ?? 'a_and_p';
    if ((authOrder[a] ?? 0) > (authOrder[highest] ?? 0)) highest = a;
  }

  const callerAuthRows = (await db.execute(sql`
    select max(mechanic_authority::text) as auth
      from public.user_roles
     where user_id = ${user.id}::uuid
       and mechanic_authority in ('a_and_p','ia')
  `)) as unknown as Array<{ auth: string | null }>;
  const userAuth = (callerAuthRows[0]?.auth ?? null) as 'a_and_p' | 'ia' | null;
  const userCanSign = userAuth != null && (authOrder[userAuth] ?? 0) >= (authOrder[highest] ?? 0);
  const allTasksDone = tasks.length > 0 && tasks.every((t) => t.completedAt != null);
  const alreadyClosed = wo.status === 'closed';

  return (
    <main style={{ padding: '0 1.5rem 2rem', maxWidth: 1300, margin: '0 auto' }}>
      <div style={{ marginBottom: '0.5rem' }}>
        <Link
          href="/admin/work-orders"
          style={{
            color: '#38bdf8',
            textDecoration: 'none',
            fontSize: '0.78rem',
            fontFamily: '"JetBrains Mono", ui-monospace, monospace',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          ← Back to work orders
        </Link>
      </div>
      <PageHeader
        eyebrow="Maintenance"
        title={wo.title}
        subtitle={
          <>
            Aircraft:{' '}
            <Link
              href={`/admin/aircraft/${wo.aircraftId}`}
              style={{ color: '#38bdf8', textDecoration: 'none' }}
            >
              {ac?.tailNumber ?? '—'}
            </Link>
            {' · '}Kind: <strong style={{ color: '#f7f9fc' }}>{wo.kind}</strong>
            {' · '}Status: <strong style={{ color: '#f7f9fc' }}>{wo.status}</strong>
          </>
        }
      />

      <WorkOrderTasks workOrderId={wo.id} tasks={tasks.map(serializeTask)} />

      <section
        style={{
          marginTop: '1rem',
          padding: '1rem 1.25rem',
          background: '#0d1220',
          border: '1px solid #1f2940',
          borderRadius: 12,
        }}
      >
        <h2 style={{ margin: '0 0 0.75rem 0', fontSize: '0.95rem', color: '#f7f9fc' }}>
          Parts consumed
        </h2>
        {consumption.length === 0 ? (
          <div
            style={{
              padding: '1.5rem 0.5rem',
              textAlign: 'center',
              color: '#7a869a',
              fontSize: '0.85rem',
              background: '#0d1220',
              border: '1px dashed #1f2940',
              borderRadius: 8,
            }}
          >
            No parts consumed yet.
          </div>
        ) : (
          <div
            style={{
              background: '#0d1220',
              border: '1px solid #1f2940',
              borderRadius: 8,
              overflow: 'hidden',
            }}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#121826' }}>
                  <th style={TH}>Part</th>
                  <th style={TH}>Lot</th>
                  <th style={TH}>Qty</th>
                  <th style={TH}>Consumed</th>
                </tr>
              </thead>
              <tbody>
                {consumption.map((c) => (
                  <tr key={c.id} style={{ borderBottom: '1px solid #161d30' }}>
                    <td style={TD}>
                      <Link
                        href={`/admin/parts/${c.partId}`}
                        style={{ color: '#38bdf8', textDecoration: 'none' }}
                      >
                        {c.partId.slice(0, 8)}
                      </Link>
                    </td>
                    <td style={MONO_TD}>
                      {c.partLotId ? (
                        c.partLotId.slice(0, 8)
                      ) : (
                        <span style={{ color: '#5b6784' }}>—</span>
                      )}
                    </td>
                    <td style={MONO_TD}>{c.quantity}</td>
                    <td style={MONO_TD}>
                      {c.consumedAt ? (
                        new Date(c.consumedAt).toLocaleString()
                      ) : (
                        <span style={{ color: '#5b6784' }}>—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <SignOffCeremony
        workOrderId={wo.id}
        allTasksDone={allTasksDone}
        alreadyClosed={alreadyClosed}
        highestRequired={highest}
        userCanSign={userCanSign}
        userAuthority={userAuth}
      />
    </main>
  );
}

function serializeTask(t: typeof workOrderTask.$inferSelect) {
  return {
    id: t.id,
    description: t.description,
    requiredAuthority: (t.requiredAuthority as string) ?? 'a_and_p',
    completedAt: t.completedAt ? t.completedAt.toISOString() : null,
    position: t.position ?? 0,
  };
}
