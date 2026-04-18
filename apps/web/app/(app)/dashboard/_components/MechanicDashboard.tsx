'use client';

import { trpc } from '@/lib/trpc/client';
import { DashboardTile } from '@/components/DashboardTile';

export function MechanicDashboard() {
  const squawks = trpc.admin.squawks.listAssignedToMe.useQuery();
  const workOrders = trpc.admin.workOrders.listAssignedToMe.useQuery();

  const gridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
    gap: '0.75rem',
  };

  return (
    <div style={gridStyle}>
      {/* Open squawks */}
      <DashboardTile
        title="Open Squawks"
        accent={(squawks.data as unknown as unknown[] | undefined)?.length ? 'warn' : 'default'}
      >
        {squawks.isLoading ? (
          <span style={{ color: '#5b6784' }}>Loading...</span>
        ) : (squawks.data as unknown as unknown[] | undefined)?.length ? (
          (squawks.data as unknown as Array<Record<string, unknown>>).slice(0, 5).map((s) => (
            <div key={(s.id ?? s.squawk_id) as string} style={{ marginBottom: '0.25rem' }}>
              <span style={{ fontWeight: 600 }}>{s.title as string}</span>
              <span style={{ color: '#7a869a', marginLeft: '0.5rem', fontSize: '0.8rem' }}>
                {s.status as string}
              </span>
            </div>
          ))
        ) : (
          <span style={{ color: '#34d399' }}>No open squawks</span>
        )}
      </DashboardTile>

      {/* Work orders */}
      <DashboardTile
        title="My Work Orders"
        accent={(workOrders.data as unknown as unknown[] | undefined)?.length ? 'info' : 'default'}
      >
        {workOrders.isLoading ? (
          <span style={{ color: '#5b6784' }}>Loading...</span>
        ) : (workOrders.data as unknown as unknown[] | undefined)?.length ? (
          (workOrders.data as unknown as Array<Record<string, unknown>>).slice(0, 5).map((wo) => (
            <div key={wo.id as string} style={{ marginBottom: '0.25rem' }}>
              <span style={{ fontWeight: 600 }}>{(wo.kind ?? wo.work_order_kind) as string}</span>
              <span style={{ color: '#7a869a', marginLeft: '0.5rem', fontSize: '0.8rem' }}>
                {wo.status as string}
              </span>
            </div>
          ))
        ) : (
          <span style={{ color: '#34d399' }}>No open work orders</span>
        )}
      </DashboardTile>

      {/* Upcoming maintenance */}
      <DashboardTile title="Maintenance Forecast" href="/admin/dashboard">
        <span style={{ color: '#7a869a' }}>View fleet maintenance forecast &rarr;</span>
      </DashboardTile>
    </div>
  );
}
