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

export const dynamic = 'force-dynamic';

type Params = Promise<{ id: string }>;

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

  const ac = (
    await db.select().from(aircraft).where(eq(aircraft.id, wo.aircraftId)).limit(1)
  )[0];

  const tasks = await db
    .select()
    .from(workOrderTask)
    .where(
      and(eq(workOrderTask.workOrderId, wo.id), isNull(workOrderTask.deletedAt)),
    );

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
  const userCanSign =
    userAuth != null && (authOrder[userAuth] ?? 0) >= (authOrder[highest] ?? 0);
  const allTasksDone = tasks.length > 0 && tasks.every((t) => t.completedAt != null);
  const alreadyClosed = wo.status === 'closed';

  return (
    <main style={{ padding: '1rem', maxWidth: 1100 }}>
      <Link href="/admin/work-orders">← Back to work orders</Link>
      <h1 style={{ marginTop: '0.5rem' }}>{wo.title}</h1>
      <p style={{ color: '#6b7280', fontSize: '0.9rem' }}>
        Aircraft:{' '}
        <Link href={`/admin/aircraft/${wo.aircraftId}`}>{ac?.tailNumber ?? '—'}</Link>
        {' · '}Kind: <strong>{wo.kind}</strong>
        {' · '}Status: <strong>{wo.status}</strong>
      </p>

      <WorkOrderTasks workOrderId={wo.id} tasks={tasks.map(serializeTask)} />

      <section
        style={{
          marginTop: '1rem',
          padding: '0.75rem',
          border: '1px solid #e5e7eb',
          borderRadius: 6,
        }}
      >
        <h2 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem' }}>Parts consumed</h2>
        {consumption.length === 0 ? (
          <p style={{ color: '#6b7280', fontSize: '0.85rem' }}>No parts consumed yet.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                <th style={{ padding: '0.4rem' }}>Part</th>
                <th style={{ padding: '0.4rem' }}>Lot</th>
                <th style={{ padding: '0.4rem' }}>Qty</th>
                <th style={{ padding: '0.4rem' }}>Consumed</th>
              </tr>
            </thead>
            <tbody>
              {consumption.map((c) => (
                <tr key={c.id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '0.4rem' }}>
                    <Link href={`/admin/parts/${c.partId}`}>{c.partId.slice(0, 8)}</Link>
                  </td>
                  <td style={{ padding: '0.4rem' }}>
                    {c.partLotId ? c.partLotId.slice(0, 8) : '—'}
                  </td>
                  <td style={{ padding: '0.4rem' }}>{c.quantity}</td>
                  <td style={{ padding: '0.4rem' }}>
                    {c.consumedAt ? new Date(c.consumedAt).toLocaleString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
