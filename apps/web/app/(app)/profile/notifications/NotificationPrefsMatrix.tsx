'use client';

import { useMemo } from 'react';
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

type Channel = 'in_app' | 'email';

// Tri-state checkbox — shows indeterminate when some items in the group
// are enabled and others aren't. The ref callback sets the DOM property
// (React doesn't render `indeterminate` as an attribute).
function TriStateBox({
  allOn,
  anyOn,
  onChange,
  disabled,
  title,
}: {
  allOn: boolean;
  anyOn: boolean;
  onChange: (nextEnabled: boolean) => void;
  disabled?: boolean;
  title?: string;
}) {
  const mixed = anyOn && !allOn;
  return (
    <input
      type="checkbox"
      checked={allOn}
      disabled={disabled}
      title={title}
      ref={(el) => {
        if (el) el.indeterminate = mixed;
      }}
      onChange={(e) => onChange(e.target.checked)}
      style={{
        accentColor: '#fbbf24',
        cursor: disabled ? 'not-allowed' : 'pointer',
        width: 16,
        height: 16,
      }}
    />
  );
}

export function NotificationPrefsMatrix() {
  const utils = trpc.useUtils();
  const listQ = trpc.notifications.listPrefs.useQuery();
  const update = trpc.notifications.updatePref.useMutation({
    onSuccess: () => void utils.notifications.listPrefs.invalidate(),
  });
  const updateMany = trpc.notifications.updatePrefs.useMutation({
    onSuccess: () => void utils.notifications.listPrefs.invalidate(),
  });

  const rows = useMemo(() => (listQ.data ?? []) as unknown as PrefRow[], [listQ.data]);

  // Build a quick lookup: `${kind}::${channel}` → PrefRow
  const byKey = useMemo(() => {
    const m = new Map<string, PrefRow>();
    for (const r of rows) m.set(`${r.kind}::${r.channel}`, r);
    return m;
  }, [rows]);

  function findRow(kind: string, channel: Channel): PrefRow | undefined {
    return byKey.get(`${kind}::${channel}`);
  }

  /**
   * Bulk toggle for a group of kinds on a given channel.
   *
   * In-app safety-critical events cannot be disabled — we filter them
   * out when `enabled === false` on the `in_app` channel, so the "off
   * all" bulk action leaves safety items on. Turning everything back
   * ON has no such restriction.
   */
  async function setKindsChannel(kinds: string[], channel: Channel, enabled: boolean) {
    const items = kinds
      .map((k) => ({ kind: k, channel, enabled, row: findRow(k, channel) }))
      .filter((it) => {
        if (channel === 'in_app' && enabled === false && it.row?.is_safety_critical) {
          return false;
        }
        return true;
      })
      .map((it) => ({ kind: it.kind as never, channel: it.channel, enabled: it.enabled }));
    if (items.length === 0) return;
    await updateMany.mutateAsync({ items });
  }

  async function setEverything(enabled: boolean) {
    const kinds = KIND_GROUPS.flatMap((g) => g.kinds);
    await Promise.all([
      setKindsChannel(kinds, 'in_app', enabled),
      setKindsChannel(kinds, 'email', enabled),
    ]);
  }

  function groupState(kinds: string[], channel: Channel): { allOn: boolean; anyOn: boolean } {
    let on = 0;
    for (const k of kinds) {
      if (findRow(k, channel)?.enabled) on += 1;
    }
    return { allOn: on === kinds.length && kinds.length > 0, anyOn: on > 0 };
  }

  if (listQ.isLoading) {
    return (
      <p style={{ color: '#5b6784', fontFamily: '"JetBrains Mono", ui-monospace, monospace' }}>
        Loading…
      </p>
    );
  }

  const allKinds = KIND_GROUPS.flatMap((g) => g.kinds);
  const masterInApp = groupState(allKinds, 'in_app');
  const masterEmail = groupState(allKinds, 'email');
  const everythingOn = masterInApp.allOn && masterEmail.allOn;
  const everythingOff = !masterInApp.anyOn && !masterEmail.anyOn;
  const bulkBusy = updateMany.isPending;

  return (
    <div style={{ marginTop: '0.5rem' }}>
      {KIND_GROUPS.map((grp) => {
        const inAppState = groupState(grp.kinds, 'in_app');
        const emailState = groupState(grp.kinds, 'email');
        // In-app toggle is disabled if every kind in the group is safety-
        // critical (nothing can change). If some are safety and some
        // aren't, bulk disable leaves safety ON — the toggle still works.
        const nonSafetyInApp = grp.kinds.filter((k) => !findRow(k, 'in_app')?.is_safety_critical);
        const inAppFrozen = nonSafetyInApp.length === 0;

        return (
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
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
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
                              width: 16,
                              height: 16,
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
                            style={{
                              accentColor: '#fbbf24',
                              cursor: 'pointer',
                              width: 16,
                              height: 16,
                            }}
                          />
                        </td>
                      </tr>
                    );
                  })}

                  {/* Section bulk toggle row — only renders when the section
                      has more than one event. Single-row sections (Grading,
                      Messaging) don't need it since it'd just duplicate the
                      per-row toggle above. */}
                  {grp.kinds.length > 1 ? (
                    <tr style={{ background: '#0b0f1b', borderTop: '1px solid #1f2940' }}>
                      <td
                        style={{
                          ...TD,
                          fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                          fontSize: '0.68rem',
                          letterSpacing: '0.15em',
                          color: '#f97316',
                          textTransform: 'uppercase',
                          fontWeight: 600,
                        }}
                      >
                        ◆ Toggle all in this section
                      </td>
                      <td style={{ ...TD, textAlign: 'center' }}>
                        <TriStateBox
                          allOn={inAppState.allOn}
                          anyOn={inAppState.anyOn}
                          disabled={inAppFrozen || bulkBusy}
                          title={
                            inAppFrozen
                              ? 'All events here are safety-critical'
                              : 'Enable/disable all non-safety in-app in this section'
                          }
                          onChange={(next) => void setKindsChannel(grp.kinds, 'in_app', next)}
                        />
                      </td>
                      <td style={{ ...TD, textAlign: 'center' }}>
                        <TriStateBox
                          allOn={emailState.allOn}
                          anyOn={emailState.anyOn}
                          disabled={bulkBusy}
                          onChange={(next) => void setKindsChannel(grp.kinds, 'email', next)}
                        />
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}

      {/* Master toggle card */}
      <section style={{ marginTop: '2rem' }}>
        <h2
          style={{
            fontFamily: '"JetBrains Mono", ui-monospace, monospace',
            fontSize: '0.72rem',
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: '#fbbf24',
            marginBottom: '0.6rem',
            fontWeight: 600,
          }}
        >
          ◆ Global toggles
        </h2>
        <div
          style={{
            background: '#0d1220',
            border: '1px solid rgba(251, 191, 36, 0.35)',
            borderRadius: 12,
            overflow: 'hidden',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ background: '#121826' }}>
                <th style={TH}>Scope</th>
                <th style={{ ...TH, width: 120, textAlign: 'center' }}>In-app</th>
                <th style={{ ...TH, width: 120, textAlign: 'center' }}>Email</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1px solid #161d30' }}>
                <td style={TD}>
                  <span
                    style={{
                      fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                      fontSize: '0.8rem',
                      color: '#cbd5e1',
                    }}
                  >
                    All sections · all events
                  </span>
                  <div style={{ fontSize: '0.72rem', color: '#7a869a', marginTop: '0.2rem' }}>
                    Safety-critical in-app deliveries always remain enabled.
                  </div>
                </td>
                <td style={{ ...TD, textAlign: 'center' }}>
                  <TriStateBox
                    allOn={masterInApp.allOn}
                    anyOn={masterInApp.anyOn}
                    disabled={bulkBusy}
                    title="Enable/disable all non-safety in-app notifications"
                    onChange={(next) => void setKindsChannel(allKinds, 'in_app', next)}
                  />
                </td>
                <td style={{ ...TD, textAlign: 'center' }}>
                  <TriStateBox
                    allOn={masterEmail.allOn}
                    anyOn={masterEmail.anyOn}
                    disabled={bulkBusy}
                    onChange={(next) => void setKindsChannel(allKinds, 'email', next)}
                  />
                </td>
              </tr>
            </tbody>
          </table>
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '0.5rem',
              padding: '0.75rem 0.9rem',
              borderTop: '1px solid #1f2940',
              background: '#0b0f1b',
              flexWrap: 'wrap',
            }}
          >
            <button
              type="button"
              disabled={bulkBusy || everythingOn}
              onClick={() => void setEverything(true)}
              style={{
                padding: '0 0.95rem',
                height: '2.3rem',
                background: 'rgba(52, 211, 153, 0.12)',
                color: '#34d399',
                border: '1px solid rgba(52, 211, 153, 0.35)',
                borderRadius: 6,
                fontSize: '0.68rem',
                fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                fontWeight: 600,
                cursor: bulkBusy || everythingOn ? 'not-allowed' : 'pointer',
                opacity: bulkBusy || everythingOn ? 0.5 : 1,
              }}
            >
              Enable everything
            </button>
            <button
              type="button"
              disabled={bulkBusy || everythingOff}
              onClick={() => void setEverything(false)}
              style={{
                padding: '0 0.95rem',
                height: '2.3rem',
                background: 'transparent',
                color: '#f87171',
                border: '1px solid rgba(248, 113, 113, 0.35)',
                borderRadius: 6,
                fontSize: '0.68rem',
                fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                fontWeight: 600,
                cursor: bulkBusy || everythingOff ? 'not-allowed' : 'pointer',
                opacity: bulkBusy || everythingOff ? 0.5 : 1,
              }}
            >
              Disable everything
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
