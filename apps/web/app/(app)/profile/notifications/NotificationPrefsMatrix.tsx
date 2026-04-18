'use client';

import { trpc } from '@/lib/trpc/client';

interface PrefRow {
  kind: string;
  channel: string;
  enabled: boolean;
  is_safety_critical: boolean | null;
  has_user_override: boolean;
}

const KIND_GROUPS: Array<{ label: string; kinds: string[] }> = [
  {
    label: 'Reservations',
    kinds: [
      'reservation_requested',
      'reservation_approved',
      'reservation_changed',
      'reservation_cancelled',
      'reservation_reminder_24h',
    ],
  },
  { label: 'Grading', kinds: ['grading_complete'] },
  {
    label: 'Squawks',
    kinds: ['squawk_opened', 'squawk_grounding', 'squawk_returned_to_service'],
  },
  {
    label: 'Documents & currency',
    kinds: ['document_expiring', 'currency_expiring'],
  },
  { label: 'Messaging', kinds: ['admin_broadcast'] },
  {
    label: 'Safety-critical',
    kinds: ['overdue_aircraft', 'grounded_aircraft_attempted_use', 'duty_hour_warning'],
  },
];

const KIND_LABELS: Record<string, string> = {
  reservation_requested: 'Reservation requested',
  reservation_approved: 'Reservation confirmed',
  reservation_changed: 'Reservation updated',
  reservation_cancelled: 'Reservation cancelled',
  reservation_reminder_24h: '24-hour reminder',
  grading_complete: 'Grading complete',
  squawk_opened: 'Squawk opened',
  squawk_grounding: 'Aircraft grounded',
  squawk_returned_to_service: 'Aircraft cleared',
  document_expiring: 'Document expiring',
  currency_expiring: 'Currency expiring',
  admin_broadcast: 'Admin broadcast',
  overdue_aircraft: 'Overdue aircraft',
  grounded_aircraft_attempted_use: 'Grounded-aircraft use attempt',
  duty_hour_warning: 'Duty-hour warning',
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

export function NotificationPrefsMatrix() {
  const utils = trpc.useUtils();
  const listQ = trpc.notifications.listPrefs.useQuery();
  const update = trpc.notifications.updatePref.useMutation({
    onSuccess: () => void utils.notifications.listPrefs.invalidate(),
  });

  if (listQ.isLoading) return <p style={{ color: '#5b6784' }}>Loading…</p>;
  const rows = (listQ.data ?? []) as unknown as PrefRow[];

  function findRow(kind: string, channel: string): PrefRow | undefined {
    return rows.find((r) => r.kind === kind && r.channel === channel);
  }

  return (
    <div style={{ marginTop: '0.5rem' }}>
      {KIND_GROUPS.map((grp) => (
        <section key={grp.label} style={{ marginBottom: '1.5rem' }}>
          <h2
            style={{
              fontFamily: '"JetBrains Mono", ui-monospace, monospace',
              fontSize: '0.72rem',
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: '#7a869a',
              marginBottom: '0.6rem',
              fontWeight: 500,
            }}
          >
            {grp.label}
          </h2>
          <div
            style={{
              background: '#0d1220',
              border: '1px solid #1f2940',
              borderRadius: 12,
              overflow: 'hidden',
            }}
          >
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '0.85rem',
              }}
            >
              <thead>
                <tr style={{ background: '#121826' }}>
                  <th style={TH}>Event</th>
                  <th style={{ ...TH, width: 120, textAlign: 'center' }}>In-app</th>
                  <th style={{ ...TH, width: 120, textAlign: 'center' }}>Email</th>
                </tr>
              </thead>
              <tbody>
                {grp.kinds.map((kind) => {
                  const inApp = findRow(kind, 'in_app');
                  const email = findRow(kind, 'email');
                  const safety = !!(inApp?.is_safety_critical || email?.is_safety_critical);
                  return (
                    <tr key={kind} style={{ borderBottom: '1px solid #161d30' }}>
                      <td style={TD}>
                        <span
                          style={{
                            fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                            fontSize: '0.8rem',
                            color: '#cbd5e1',
                          }}
                        >
                          {KIND_LABELS[kind] ?? kind}
                        </span>
                        {safety ? (
                          <span
                            style={{
                              marginLeft: '0.5rem',
                              padding: '0.12rem 0.45rem',
                              borderRadius: 999,
                              background: 'rgba(248, 113, 113, 0.14)',
                              color: '#f87171',
                              border: '1px solid rgba(248, 113, 113, 0.35)',
                              fontSize: '0.62rem',
                              fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                              letterSpacing: '0.12em',
                              textTransform: 'uppercase',
                              fontWeight: 600,
                            }}
                          >
                            Safety
                          </span>
                        ) : null}
                      </td>
                      <td style={{ ...TD, textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={!!inApp?.enabled}
                          disabled={safety}
                          title={safety ? 'always delivered for safety' : undefined}
                          onChange={(e) =>
                            update.mutate({
                              kind: kind as never,
                              channel: 'in_app',
                              enabled: e.target.checked,
                            })
                          }
                          style={{
                            accentColor: '#fbbf24',
                            cursor: safety ? 'not-allowed' : 'pointer',
                          }}
                        />
                      </td>
                      <td style={{ ...TD, textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={!!email?.enabled}
                          onChange={(e) =>
                            update.mutate({
                              kind: kind as never,
                              channel: 'email',
                              enabled: e.target.checked,
                            })
                          }
                          style={{ accentColor: '#fbbf24', cursor: 'pointer' }}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
