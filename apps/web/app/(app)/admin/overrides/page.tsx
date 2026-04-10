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

type Scope = 'active' | 'recent30d' | 'all';

function resolveStatus(row: Record<string, unknown>): string {
  if (row.revoked_at) return 'revoked';
  if (row.consumed_at) return 'consumed';
  if (row.expires_at && new Date(String(row.expires_at)) < new Date()) return 'expired';
  return 'active';
}

function statusBadge(status: string): { bg: string; fg: string } {
  if (status === 'active') return { bg: '#dcfce7', fg: '#166534' };
  if (status === 'consumed') return { bg: '#dbeafe', fg: '#1e40af' };
  if (status === 'revoked') return { bg: '#fee2e2', fg: '#991b1b' };
  if (status === 'expired') return { bg: '#f3f4f6', fg: '#6b7280' };
  return { bg: '#f3f4f6', fg: '#374151' };
}

function fmtDate(val: unknown): string {
  if (!val) return '--';
  const d = new Date(String(val));
  if (isNaN(d.getTime())) return '--';
  return d.toLocaleDateString();
}

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
    <main style={{ padding: '1rem', maxWidth: 1200 }}>
      <h1>Management overrides</h1>

      <div style={{ display: 'flex', gap: '0.5rem', margin: '0.75rem 0' }}>
        {(['active', 'recent30d', 'all'] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setScope(s)}
            style={{
              padding: '0.3rem 0.6rem',
              border: '1px solid #d1d5db',
              borderRadius: 4,
              background: scope === s ? '#2563eb' : 'white',
              color: scope === s ? 'white' : '#374151',
              cursor: 'pointer',
              fontSize: '0.85rem',
              fontWeight: scope === s ? 600 : 400,
            }}
          >
            {s === 'active' ? 'Active only' : s === 'recent30d' ? 'Last 30 days' : 'All'}
          </button>
        ))}
      </div>

      {query.isLoading ? (
        <p style={{ color: '#888' }}>Loading overrides...</p>
      ) : rows.length === 0 ? (
        <p style={{ color: '#888' }}>No overrides found for the selected filter.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
              <th style={{ padding: '0.4rem' }}>Student</th>
              <th style={{ padding: '0.4rem' }}>Kind</th>
              <th style={{ padding: '0.4rem' }}>Justification</th>
              <th style={{ padding: '0.4rem' }}>Granted by</th>
              <th style={{ padding: '0.4rem' }}>Granted</th>
              <th style={{ padding: '0.4rem' }}>Expires</th>
              <th style={{ padding: '0.4rem' }}>Status</th>
              <th style={{ padding: '0.4rem' }}>Actions</th>
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
                <tr key={String(r.id)} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '0.4rem' }}>
                    {studentUserId ? (
                      <Link href={`/admin/people/${studentUserId}`}>
                        {String(r.student_name ?? 'Unknown')}
                      </Link>
                    ) : (
                      String(r.student_name ?? 'Unknown')
                    )}
                  </td>
                  <td style={{ padding: '0.4rem' }}>{overrideKindLabel(String(r.kind ?? ''))}</td>
                  <td
                    style={{
                      padding: '0.4rem',
                      maxWidth: 200,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={String(r.justification ?? '')}
                  >
                    {String(r.justification ?? '')}
                  </td>
                  <td style={{ padding: '0.4rem' }}>{String(r.granted_by_name ?? '--')}</td>
                  <td style={{ padding: '0.4rem' }}>{fmtDate(r.granted_at)}</td>
                  <td style={{ padding: '0.4rem' }}>{fmtDate(r.expires_at)}</td>
                  <td style={{ padding: '0.4rem' }}>
                    <span
                      style={{
                        background: badge.bg,
                        color: badge.fg,
                        padding: '0.1rem 0.4rem',
                        borderRadius: 3,
                        fontSize: '0.7rem',
                        fontWeight: 600,
                      }}
                    >
                      {status}
                    </span>
                  </td>
                  <td style={{ padding: '0.4rem' }}>
                    {status === 'active' ? (
                      <button
                        type="button"
                        onClick={() => setRevokeTarget(String(r.id))}
                        style={{
                          fontSize: '0.8rem',
                          padding: '0.2rem 0.5rem',
                          border: '1px solid #dc2626',
                          borderRadius: 4,
                          background: 'white',
                          color: '#dc2626',
                          cursor: 'pointer',
                        }}
                      >
                        Revoke
                      </button>
                    ) : (
                      '--'
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {revokeTarget ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
          }}
        >
          <div
            style={{
              background: 'white',
              padding: '1.5rem',
              borderRadius: 8,
              maxWidth: 460,
              width: '100%',
            }}
          >
            <h3 style={{ margin: '0 0 0.75rem' }}>Revoke override</h3>
            <p style={{ fontSize: '0.85rem', color: '#555' }}>
              Provide a reason for revoking this management override. This action is permanent.
            </p>
            <textarea
              rows={3}
              value={revokeReason}
              onChange={(e) => setRevokeReason(e.target.value)}
              placeholder="Reason for revocation"
              style={{ width: '100%', marginTop: '0.5rem', padding: '0.5rem' }}
            />
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
              <button
                type="button"
                onClick={() => {
                  setRevokeTarget(null);
                  setRevokeReason('');
                }}
                style={{
                  padding: '0.35rem 0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: 4,
                  background: 'white',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!revokeReason.trim() || revokeMut.isPending}
                onClick={() => void handleRevoke()}
                style={{
                  padding: '0.35rem 0.75rem',
                  border: 'none',
                  borderRadius: 4,
                  background: '#dc2626',
                  color: 'white',
                  cursor: 'pointer',
                  fontWeight: 500,
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
