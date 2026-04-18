/**
 * /admin/parts/[id] — part detail + lots + consumption history.
 */
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db, users, part, partLot } from '@part61/db';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ReceiveLotForm } from './ReceiveLotForm';
import { PageHeader } from '@/components/ui';

export const dynamic = 'force-dynamic';

type Params = Promise<{ id: string }>;

type ConsumptionRow = {
  id: string;
  consumed_at: string;
  quantity: string;
  work_order_id: string;
  wo_title: string | null;
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

const MONO_TD: React.CSSProperties = {
  ...TD,
  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
  fontSize: '0.76rem',
};

const SECTION_CARD: React.CSSProperties = {
  marginTop: '1rem',
  padding: '1rem 1.1rem',
  background: '#0d1220',
  border: '1px solid #1f2940',
  borderRadius: 12,
};

const SECTION_H2: React.CSSProperties = {
  margin: '0 0 0.75rem',
  fontSize: '0.75rem',
  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
  color: '#7a869a',
  textTransform: 'uppercase',
  letterSpacing: '0.15em',
  fontWeight: 500,
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
      and(eq(partLot.partId, p.id), eq(partLot.schoolId, me.schoolId), isNull(partLot.deletedAt)),
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
    <main style={{ padding: '0 1.5rem 2rem', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: '0.75rem' }}>
        <Link
          href="/admin/parts"
          style={{
            color: '#7a869a',
            fontFamily: '"JetBrains Mono", ui-monospace, monospace',
            fontSize: '0.72rem',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            textDecoration: 'none',
          }}
        >
          ← Back to parts
        </Link>
      </div>
      <PageHeader
        eyebrow="Maintenance"
        title={`${p.partNumber} — ${p.description ?? ''}`}
        subtitle={
          <span
            style={{ fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: '0.78rem' }}
          >
            Kind: <strong style={{ color: '#f7f9fc' }}>{p.kind}</strong> · Unit:{' '}
            <strong style={{ color: '#f7f9fc' }}>{p.unit}</strong> · On hand:{' '}
            <strong style={{ color: '#34d399' }}>{Number(p.onHandQty ?? 0).toFixed(2)}</strong>
          </span>
        }
      />

      <section style={SECTION_CARD}>
        <h2 style={SECTION_H2}>Lots</h2>
        {lots.length === 0 ? (
          <div
            style={{
              padding: '2rem 1rem',
              textAlign: 'center',
              color: '#7a869a',
              fontSize: '0.85rem',
              background: '#05070e',
              border: '1px dashed #1f2940',
              borderRadius: 8,
            }}
          >
            No lots recorded.
          </div>
        ) : (
          <div
            style={{
              background: '#05070e',
              border: '1px solid #161d30',
              borderRadius: 8,
              overflow: 'hidden',
            }}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ background: '#121826' }}>
                  <th style={TH}>Received</th>
                  <th style={TH}>Lot #</th>
                  <th style={TH}>Serial</th>
                  <th style={TH}>Qty received</th>
                  <th style={TH}>Qty remaining</th>
                  <th style={TH}>Supplier</th>
                </tr>
              </thead>
              <tbody>
                {lots.map((l) => (
                  <tr key={l.id} style={{ borderBottom: '1px solid #161d30' }}>
                    <td style={MONO_TD}>
                      {l.receivedAt ? (
                        new Date(l.receivedAt).toLocaleDateString()
                      ) : (
                        <span style={{ color: '#5b6784' }}>—</span>
                      )}
                    </td>
                    <td style={MONO_TD}>
                      {l.lotNumber ?? <span style={{ color: '#5b6784' }}>—</span>}
                    </td>
                    <td style={MONO_TD}>
                      {l.serialNumber ?? <span style={{ color: '#5b6784' }}>—</span>}
                    </td>
                    <td style={{ ...MONO_TD, color: '#f7f9fc' }}>{l.receivedQty}</td>
                    <td style={{ ...MONO_TD, color: '#34d399' }}>{l.qtyRemaining}</td>
                    <td style={TD}>{l.supplier ?? <span style={{ color: '#5b6784' }}>—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ marginTop: '0.75rem' }}>
          <ReceiveLotForm partId={p.id} />
        </div>
      </section>

      <section style={SECTION_CARD}>
        <h2 style={SECTION_H2}>Consumption history</h2>
        {history.length === 0 ? (
          <div
            style={{
              padding: '2rem 1rem',
              textAlign: 'center',
              color: '#7a869a',
              fontSize: '0.85rem',
              background: '#05070e',
              border: '1px dashed #1f2940',
              borderRadius: 8,
            }}
          >
            No consumption recorded.
          </div>
        ) : (
          <div
            style={{
              background: '#05070e',
              border: '1px solid #161d30',
              borderRadius: 8,
              overflow: 'hidden',
            }}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ background: '#121826' }}>
                  <th style={TH}>When</th>
                  <th style={TH}>Qty</th>
                  <th style={TH}>Work order</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id} style={{ borderBottom: '1px solid #161d30' }}>
                    <td style={MONO_TD}>{new Date(h.consumed_at).toLocaleString()}</td>
                    <td style={{ ...MONO_TD, color: '#f7f9fc' }}>{h.quantity}</td>
                    <td style={TD}>
                      <Link
                        href={`/admin/work-orders/${h.work_order_id}`}
                        style={{
                          color: '#38bdf8',
                          fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                          fontSize: '0.78rem',
                          textDecoration: 'none',
                        }}
                      >
                        {h.wo_title ?? h.work_order_id.slice(0, 8)}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
