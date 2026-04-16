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

export function NotificationPrefsMatrix() {
  const utils = trpc.useUtils();
  const listQ = trpc.notifications.listPrefs.useQuery();
  const update = trpc.notifications.updatePref.useMutation({
    onSuccess: () => void utils.notifications.listPrefs.invalidate(),
  });

  if (listQ.isLoading) return <p>Loading…</p>;
  const rows = (listQ.data ?? []) as unknown as PrefRow[];

  function findRow(kind: string, channel: string): PrefRow | undefined {
    return rows.find((r) => r.kind === kind && r.channel === channel);
  }

  return (
    <div style={{ marginTop: '1rem' }}>
      {KIND_GROUPS.map((grp) => (
        <section key={grp.label} style={{ marginBottom: '1.25rem' }}>
          <h2 style={{ fontSize: '0.95rem', marginBottom: '0.5rem' }}>{grp.label}</h2>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '0.85rem',
              background: 'white',
              border: '1px solid #e5e7eb',
              borderRadius: 6,
            }}
          >
            <thead>
              <tr style={{ background: '#f9fafb', textAlign: 'left' }}>
                <th style={{ padding: '0.5rem 0.75rem' }}>Event</th>
                <th style={{ padding: '0.5rem 0.75rem', width: 120 }}>In-app</th>
                <th style={{ padding: '0.5rem 0.75rem', width: 120 }}>Email</th>
              </tr>
            </thead>
            <tbody>
              {grp.kinds.map((kind) => {
                const inApp = findRow(kind, 'in_app');
                const email = findRow(kind, 'email');
                const safety = !!(inApp?.is_safety_critical || email?.is_safety_critical);
                return (
                  <tr key={kind} style={{ borderTop: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '0.5rem 0.75rem' }}>
                      {KIND_LABELS[kind] ?? kind}
                      {safety ? (
                        <span
                          style={{
                            marginLeft: '0.4rem',
                            fontSize: '0.7rem',
                            color: '#b91c1c',
                            fontWeight: 600,
                          }}
                        >
                          Safety
                        </span>
                      ) : null}
                    </td>
                    <td style={{ padding: '0.5rem 0.75rem' }}>
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
                      />
                    </td>
                    <td style={{ padding: '0.5rem 0.75rem' }}>
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
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}
