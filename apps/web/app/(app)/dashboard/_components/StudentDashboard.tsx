'use client';

import { trpc } from '@/lib/trpc/client';
import { DashboardTile } from '@/components/DashboardTile';
import { ExpiryBadge } from '@/components/ExpiryBadge';

export function StudentDashboard() {
  const schedule = trpc.schedule.list.useQuery({ mode: 'mine' });
  const record = trpc.record.me.useQuery();
  const docs = trpc.documents.list.useQuery();

  const scheduleRows = (schedule.data as unknown as { rows?: Array<Record<string, unknown>> })
    ?.rows;
  const nextRes = scheduleRows?.[0];
  const aircraftId = (nextRes?.aircraft_id ?? nextRes?.aircraftId) as string | undefined;

  const squawks = trpc.admin.squawks.listOpenForAircraft.useQuery(
    { aircraftId: aircraftId as string },
    { enabled: !!aircraftId },
  );

  const gridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
    gap: '0.75rem',
  };

  return (
    <div style={gridStyle}>
      {/* Tile 1: Next reservation */}
      <DashboardTile title="Next Reservation" href="/schedule">
        {schedule.isLoading ? (
          <span style={{ color: '#999' }}>Loading...</span>
        ) : nextRes ? (
          <div>
            <strong>
              {(nextRes.aircraft_tail as string) ?? (nextRes.aircraftTail as string) ?? 'TBD'}
            </strong>
            {' \u00B7 '}
            {nextRes.time_range ? formatRange(nextRes.time_range as string) : 'Scheduled'}
          </div>
        ) : (
          <span style={{ color: '#999' }}>No upcoming reservations</span>
        )}
      </DashboardTile>

      {/* Tile 2: Syllabus progress */}
      <DashboardTile title="Syllabus Progress" href="/record">
        {record.isLoading ? (
          <span style={{ color: '#999' }}>Loading...</span>
        ) : (record.data as Record<string, unknown> | undefined)?.enrollments ? (
          (
            (record.data as Record<string, unknown>).enrollments as Array<Record<string, unknown>>
          ).map((e) => (
            <div key={e.id as string} style={{ marginBottom: '0.25rem' }}>
              Course enrollment active
            </div>
          ))
        ) : (
          <span style={{ color: '#999' }}>No active enrollment</span>
        )}
      </DashboardTile>

      {/* Tile 3: Currency status */}
      <DashboardTile title="Currency Status" accent="info">
        <span style={{ color: '#999' }}>Currency data on your record page</span>
      </DashboardTile>

      {/* Tile 4: Outstanding squawks on next aircraft */}
      <DashboardTile
        title="Aircraft Squawks"
        accent={(squawks.data as unknown as unknown[] | undefined)?.length ? 'warn' : 'default'}
      >
        {!aircraftId ? (
          <span style={{ color: '#999' }}>No aircraft scheduled</span>
        ) : squawks.isLoading ? (
          <span style={{ color: '#999' }}>Loading...</span>
        ) : (squawks.data as unknown as unknown[] | undefined)?.length ? (
          <div>
            {(squawks.data as unknown as Array<Record<string, unknown>>).slice(0, 3).map((s) => (
              <div key={s.id as string} style={{ marginBottom: '0.25rem', color: '#dc2626' }}>
                {s.severity as string}: {s.title as string}
              </div>
            ))}
            {(squawks.data as unknown as unknown[]).length > 3 && (
              <a href={`/admin/aircraft/${aircraftId}/squawks`} style={{ fontSize: '0.8rem' }}>
                View all {(squawks.data as unknown as unknown[]).length}
              </a>
            )}
          </div>
        ) : (
          <span style={{ color: '#16a34a' }}>No open squawks</span>
        )}
      </DashboardTile>

      {/* Tile 5: Expiring documents */}
      <DashboardTile title="Documents" href="/profile/documents">
        {docs.isLoading ? (
          <span style={{ color: '#999' }}>Loading...</span>
        ) : (docs.data as unknown as unknown[] | undefined)?.length ? (
          (docs.data as unknown as Array<Record<string, unknown>>)
            .filter((d) => d.expiresAt || d.expires_at)
            .sort((a, b) => {
              const ae = new Date((a.expiresAt as string) ?? (a.expires_at as string)).getTime();
              const be = new Date((b.expiresAt as string) ?? (b.expires_at as string)).getTime();
              return ae - be;
            })
            .slice(0, 4)
            .map((d) => (
              <div
                key={d.id as string}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: '0.25rem',
                }}
              >
                <span>{(d.kind as string) ?? 'Document'}</span>
                <ExpiryBadge expiresAt={((d.expiresAt ?? d.expires_at) as string | null) ?? null} />
              </div>
            ))
        ) : (
          <span style={{ color: '#999' }}>No documents uploaded</span>
        )}
      </DashboardTile>

      {/* Tile 6: Upload document */}
      <DashboardTile title="Upload Document" href="/profile/documents">
        <span style={{ color: '#999' }}>Upload medical, license, ID, or insurance &rarr;</span>
      </DashboardTile>
    </div>
  );
}

function formatRange(range: string): string {
  const m = range.match(/\["?([^",]+)"?,/);
  if (!m) return '';
  const raw = (m[1] ?? '')
    .trim()
    .replace(' ', 'T')
    .replace(/([+-]\d{2})$/, '$1:00');
  try {
    return new Date(raw).toLocaleString();
  } catch {
    return raw;
  }
}
