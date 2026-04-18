'use client';

/**
 * /admin/overrides — full-page override surveillance (IPF-06).
 *
 * Lists all management overrides with filter controls and revoke action.
 * Uses tRPC client queries (admin.overrides.list + admin.overrides.revoke).
 */

import { useState } from 'react';
import Link from 'next/link';
import { trpc } from '@/lib/trpc/client';
import { overrideKindLabel } from '@part61/domain';
import { PageHeader } from '@/components/ui';

type Scope = 'active' | 'recent30d' | 'all';

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

function resolveStatus(row: Record<string, unknown>): string {
  if (row.revoked_at) return 'revoked';
  if (row.consumed_at) return 'consumed';
  if (row.expires_at && new Date(String(row.expires_at)) < new Date()) return 'expired';
  return 'active';
}

function statusBadge(status: string): { bg: string; fg: string; border: string } {
  if (status === 'active')
    return {
      bg: 'rgba(52, 211, 153, 0.12)',
      fg: '#34d399',
      border: 'rgba(52, 211, 153, 0.35)',
    };
  if (status === 'consumed')
    return {
      bg: 'rgba(56, 189, 248, 0.12)',
      fg: '#38bdf8',
      border: 'rgba(56, 189, 248, 0.35)',
    };
  if (status === 'revoked')
    return {
      bg: 'rgba(248, 113, 113, 0.14)',
      fg: '#f87171',
      border: 'rgba(248, 113, 113, 0.35)',
    };
  if (status === 'expired')
    return {
      bg: 'rgba(122, 134, 154, 0.14)',
      fg: '#7a869a',
      border: 'rgba(122, 134, 154, 0.35)',
    };
  return {
    bg: 'rgba(122, 134, 154, 0.14)',
    fg: '#7a869a',
    border: 'rgba(122, 134, 154, 0.35)',
  };
}

function fmtDate(val: unknown): string {
  if (!val) return '—';
  const d = new Date(String(val));
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString();
}

const SCOPE_LABEL: Record<Scope, string> = {
  active: 'Active only',
  recent30d: 'Last 30 days',
  all: 'All',
};

export default function AdminOverridesPage() {
  const [scope, setScope] = useState<Scope>('active');
  const [revokeTarget, setRevokeTarget] = useState<string | null>(null);
  const [revokeReason, setRevokeReason] = useState('');

  const utils = trpc.useUtils();
  const query = trpc.admin.overrides.list.useQuery({ scope });
  const revokeMut = trpc.admin.overrides.revoke.useMutation();

  const rows = (query.data ?? []) as Array<Record<string, unknown>>;

  async function handleRevoke() {
    if (!revokeTarget || !revokeReason.trim()) return;
    await revokeMut.mutateAsync({ overrideId: revokeTarget, reason: revokeReason.trim() });
    setRevokeTarget(null);
    setRevokeReason('');
    void utils.admin.overrides.list.invalidate();
  }

  return (
    <main style={{ padding: '0 1.5rem 2rem', maxWidth: 1200, margin: '0 auto' }}>
      <PageHeader
        eyebrow="Management"
        title="Management overrides"
        subtitle="Every override granted in the school — filter by scope and revoke active overrides."
      />

      <div
        style={{
          display: 'flex',
          gap: '0.4rem',
          margin: '0 0 1.25rem',
          flexWrap: 'wrap',
        }}
      >
        {(['active', 'recent30d', 'all'] as const).map((s) => {
          const isActive = scope === s;
          return (
            <button
              key={s}
              type="button"
              onClick={() => setScope(s)}
              style={{
                padding: '0.35rem 0.85rem',
                borderRadius: 999,
                border: `1px solid ${isActive ? '#fbbf24' : '#1f2940'}`,
                background: isActive ? 'rgba(251, 191, 36, 0.12)' : '#0d1220',
                color: isActive ? '#fbbf24' : '#cbd5e1',
                cursor: 'pointer',
                fontSize: '0.72rem',
                fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                fontWeight: isActive ? 600 : 500,
                transition: 'background 0.15s ease, border-color 0.15s ease, color 0.15s ease',
              }}
            >
              {SCOPE_LABEL[s]}
            </button>
          );
        })}
      </div>

      {query.isLoading ? (
        <div
          style={{
            padding: '3rem 1rem',
            textAlign: 'center',
            color: '#7a869a',
            fontSize: '0.88rem',
            background: '#0d1220',
            border: '1px dashed #1f2940',
            borderRadius: 12,
          }}
        >
          Loading overrides...
        </div>
      ) : rows.length === 0 ? (
        <div
          style={{
            padding: '3rem 1rem',
            textAlign: 'center',
            color: '#7a869a',
            fontSize: '0.88rem',
            background: '#0d1220',
            border: '1px dashed #1f2940',
            borderRadius: 12,
          }}
        >
          No overrides found for the selected filter.
        </div>
      ) : (
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
                <th style={TH}>Student</th>
                <th style={TH}>Kind</th>
                <th style={TH}>Justification</th>
                <th style={TH}>Granted by</th>
                <th style={TH}>Granted</th>
                <th style={TH}>Expires</th>
                <th style={TH}>Status</th>
                <th style={TH}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const status = resolveStatus(r);
                const badge = statusBadge(status);
                const studentUserId = String(
                  (r as Record<string, unknown>).student_user_id ??
                    (r as Record<string, unknown>).user_id ??
                    '',
                );
                return (
                  <tr key={String(r.id)} style={{ borderBottom: '1px solid #161d30' }}>
                    <td style={TD}>
                      {studentUserId ? (
                        <Link
                          href={`/admin/people/${studentUserId}`}
                          style={{ color: '#f7f9fc', textDecoration: 'none', fontWeight: 500 }}
                        >
                          {String(r.student_name ?? 'Unknown')}
                        </Link>
                      ) : (
                        String(r.student_name ?? 'Unknown')
                      )}
                    </td>
                    <td style={TD}>{overrideKindLabel(String(r.kind ?? ''))}</td>
                    <td
                      style={{
                        ...TD,
                        maxWidth: 240,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={String(r.justification ?? '')}
                    >
                      {r.justification ? (
                        String(r.justification)
                      ) : (
                        <span style={{ color: '#5b6784' }}>—</span>
                      )}
                    </td>
                    <td style={TD}>
                      {r.granted_by_name ? (
                        String(r.granted_by_name)
                      ) : (
                        <span style={{ color: '#5b6784' }}>—</span>
                      )}
                    </td>
                    <td
                      style={{
                        ...TD,
                        fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                        fontSize: '0.76rem',
                      }}
                    >
                      {fmtDate(r.granted_at)}
                    </td>
                    <td
                      style={{
                        ...TD,
                        fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                        fontSize: '0.76rem',
                      }}
                    >
                      {fmtDate(r.expires_at)}
                    </td>
                    <td style={TD}>
                      <span
                        style={{
                          display: 'inline-flex',
                          padding: '0.18rem 0.55rem',
                          borderRadius: 999,
                          background: badge.bg,
                          color: badge.fg,
                          border: `1px solid ${badge.border}`,
                          fontSize: '0.68rem',
                          fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                          letterSpacing: '0.1em',
                          textTransform: 'uppercase',
                          fontWeight: 600,
                        }}
                      >
                        {status}
                      </span>
                    </td>
                    <td style={TD}>
                      {status === 'active' ? (
                        <button
                          type="button"
                          onClick={() => setRevokeTarget(String(r.id))}
                          style={{
                            padding: '0.3rem 0.7rem',
                            background: 'transparent',
                            color: '#f87171',
                            border: '1px solid rgba(248, 113, 113, 0.35)',
                            borderRadius: 6,
                            fontSize: '0.7rem',
                            fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                            letterSpacing: '0.1em',
                            textTransform: 'uppercase',
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          Revoke
                        </button>
                      ) : (
                        <span style={{ color: '#5b6784' }}>—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {revokeTarget ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(4, 8, 18, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
            backdropFilter: 'blur(2px)',
          }}
        >
          <div
            style={{
              background: '#0d1220',
              border: '1px solid #1f2940',
              padding: '1.5rem',
              borderRadius: 12,
              maxWidth: 480,
              width: '100%',
              boxShadow: '0 10px 40px rgba(0, 0, 0, 0.5)',
            }}
          >
            <h3
              style={{
                margin: '0 0 0.75rem',
                color: '#f7f9fc',
                fontSize: '1.1rem',
                fontWeight: 600,
              }}
            >
              Revoke override
            </h3>
            <p style={{ fontSize: '0.85rem', color: '#7a869a', margin: '0 0 0.5rem' }}>
              Provide a reason for revoking this management override. This action is permanent.
            </p>
            <textarea
              rows={3}
              value={revokeReason}
              onChange={(e) => setRevokeReason(e.target.value)}
              placeholder="Reason for revocation"
              style={{
                width: '100%',
                marginTop: '0.5rem',
                padding: '0.55rem 0.65rem',
                background: '#121826',
                color: '#f7f9fc',
                border: '1px solid #293352',
                borderRadius: 6,
                fontSize: '0.85rem',
                fontFamily: 'inherit',
                resize: 'vertical',
              }}
            />
            <div
              style={{
                display: 'flex',
                gap: '0.5rem',
                marginTop: '0.9rem',
                justifyContent: 'flex-end',
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setRevokeTarget(null);
                  setRevokeReason('');
                }}
                style={{
                  padding: '0.4rem 0.9rem',
                  background: 'transparent',
                  color: '#cbd5e1',
                  border: '1px solid #293352',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontSize: '0.72rem',
                  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  fontWeight: 600,
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!revokeReason.trim() || revokeMut.isPending}
                onClick={() => void handleRevoke()}
                style={{
                  padding: '0.4rem 0.9rem',
                  background: 'rgba(248, 113, 113, 0.12)',
                  color: '#f87171',
                  border: '1px solid rgba(248, 113, 113, 0.35)',
                  borderRadius: 6,
                  cursor: !revokeReason.trim() || revokeMut.isPending ? 'not-allowed' : 'pointer',
                  fontSize: '0.72rem',
                  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  fontWeight: 600,
                  opacity: !revokeReason.trim() || revokeMut.isPending ? 0.5 : 1,
                }}
              >
                {revokeMut.isPending ? 'Revoking...' : 'Confirm revocation'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
