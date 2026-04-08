'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';

interface PendingRow {
  id: string;
  email: string;
  created_at: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
}

export function PendingApprovalList({ rows }: { rows: PendingRow[] }) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const approveM = trpc.admin.people.approveRegistration.useMutation();
  const rejectM = trpc.admin.people.rejectRegistration.useMutation();

  async function onApprove(id: string) {
    setError(null);
    setPendingId(id);
    try {
      await approveM.mutateAsync({ userId: id });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Approval failed');
    } finally {
      setPendingId(null);
    }
  }

  async function onReject(id: string) {
    const reason = prompt('Reason for rejection?');
    if (!reason) return;
    setError(null);
    setPendingId(id);
    try {
      await rejectM.mutateAsync({ userId: id, reason });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Rejection failed');
    } finally {
      setPendingId(null);
    }
  }

  if (rows.length === 0) {
    return <p style={{ color: '#888' }}>No pending registrations.</p>;
  }

  return (
    <>
      {error ? <p style={{ color: 'crimson' }}>{error}</p> : null}
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {rows.map((r) => (
          <li
            key={r.id}
            style={{
              display: 'flex',
              gap: '1rem',
              alignItems: 'center',
              padding: '0.75rem',
              border: '1px solid #eee',
              borderRadius: 4,
              marginBottom: '0.5rem',
            }}
          >
            <div style={{ flex: 1 }}>
              <strong>
                {[r.first_name, r.last_name].filter(Boolean).join(' ') || '(no name)'}
              </strong>
              <div style={{ fontSize: '0.85rem', color: '#555' }}>
                {r.email} · {r.phone ?? 'no phone'}
              </div>
            </div>
            <button
              type="button"
              disabled={pendingId === r.id}
              onClick={() => onApprove(r.id)}
              style={{ background: '#0a7', color: 'white', padding: '0.5rem 1rem', border: 0, borderRadius: 4 }}
            >
              Accept
            </button>
            <button
              type="button"
              disabled={pendingId === r.id}
              onClick={() => onReject(r.id)}
              style={{ background: '#d33', color: 'white', padding: '0.5rem 1rem', border: 0, borderRadius: 4 }}
            >
              Reject
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
