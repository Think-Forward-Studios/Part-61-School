/**
 * /admin/parts/[id] — part detail + lots + consumption history.
 */
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db, users, part, partLot } from '@part61/db';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ReceiveLotForm } from './ReceiveLotForm';

export const dynamic = 'force-dynamic';

type Params = Promise<{ id: string }>;

type ConsumptionRow = {
  id: string;
  consumed_at: string;
  quantity: string;
  work_order_id: string;
  wo_title: string | null;
};

export default async function PartDetailPage({ params }: { params: Params }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const me = (await db.select().from(users).where(eq(users.id, user.id)).limit(1))[0];
  if (!me?.schoolId) redirect('/login');

  const p = (
    await db
      .select()
      .from(part)
      .where(and(eq(part.id, id), eq(part.schoolId, me.schoolId)))
      .limit(1)
  )[0];
  if (!p) notFound();

  const lots = await db
    .select()
    .from(partLot)
    .where(
      and(
        eq(partLot.partId, p.id),
        eq(partLot.schoolId, me.schoolId),
        isNull(partLot.deletedAt),
      ),
    )
    .orderBy(desc(partLot.receivedAt));

  const history = (await db.execute(sql`
    select
      wopc.id,
      wopc.consumed_at,
      wopc.quantity::text as quantity,
      wopc.work_order_id,
      wo.title as wo_title
    from public.work_order_part_consumption wopc
    left join public.work_order wo on wo.id = wopc.work_order_id
    where wopc.part_id = ${p.id}::uuid
      and exists (
        select 1 from public.work_order wo2
         where wo2.id = wopc.work_order_id
           and wo2.school_id = ${me.schoolId}::uuid
      )
    order by wopc.consumed_at desc
    limit 100
  `)) as unknown as ConsumptionRow[];

  return (
    <main style={{ padding: '1rem', maxWidth: 1000 }}>
      <Link href="/admin/parts">← Back to parts</Link>
      <h1 style={{ marginTop: '0.5rem' }}>
        {p.partNumber} — {p.description ?? ''}
      </h1>
      <p style={{ color: '#6b7280', fontSize: '0.9rem' }}>
        Kind: <strong>{p.kind}</strong> · Unit: <strong>{p.unit}</strong> · On hand:{' '}
        <strong>{Number(p.onHandQty ?? 0).toFixed(2)}</strong>
      </p>

      <section
        style={{
          marginTop: '1rem',
          padding: '0.75rem',
          border: '1px solid #e5e7eb',
          borderRadius: 6,
        }}
      >
        <h2 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem' }}>Lots</h2>
        {lots.length === 0 ? (
          <p style={{ color: '#6b7280', fontSize: '0.85rem' }}>No lots recorded.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                <th style={{ padding: '0.4rem' }}>Received</th>
                <th style={{ padding: '0.4rem' }}>Lot #</th>
                <th style={{ padding: '0.4rem' }}>Serial</th>
                <th style={{ padding: '0.4rem' }}>Qty received</th>
                <th style={{ padding: '0.4rem' }}>Qty remaining</th>
                <th style={{ padding: '0.4rem' }}>Supplier</th>
              </tr>
            </thead>
            <tbody>
              {lots.map((l) => (
                <tr key={l.id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '0.4rem' }}>
                    {l.receivedAt ? new Date(l.receivedAt).toLocaleDateString() : '—'}
                  </td>
                  <td style={{ padding: '0.4rem' }}>{l.lotNumber ?? '—'}</td>
                  <td style={{ padding: '0.4rem' }}>{l.serialNumber ?? '—'}</td>
                  <td style={{ padding: '0.4rem' }}>{l.receivedQty}</td>
                  <td style={{ padding: '0.4rem' }}>{l.qtyRemaining}</td>
                  <td style={{ padding: '0.4rem' }}>{l.supplier ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div style={{ marginTop: '0.75rem' }}>
          <ReceiveLotForm partId={p.id} />
        </div>
      </section>

      <section
        style={{
          marginTop: '1rem',
          padding: '0.75rem',
          border: '1px solid #e5e7eb',
          borderRadius: 6,
        }}
      >
        <h2 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem' }}>Consumption history</h2>
        {history.length === 0 ? (
          <p style={{ color: '#6b7280', fontSize: '0.85rem' }}>No consumption recorded.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                <th style={{ padding: '0.4rem' }}>When</th>
                <th style={{ padding: '0.4rem' }}>Qty</th>
                <th style={{ padding: '0.4rem' }}>Work order</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '0.4rem' }}>
                    {new Date(h.consumed_at).toLocaleString()}
                  </td>
                  <td style={{ padding: '0.4rem' }}>{h.quantity}</td>
                  <td style={{ padding: '0.4rem' }}>
                    <Link href={`/admin/work-orders/${h.work_order_id}`}>
                      {h.wo_title ?? h.work_order_id.slice(0, 8)}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
