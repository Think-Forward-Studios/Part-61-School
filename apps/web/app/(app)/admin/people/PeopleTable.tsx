'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

export interface PeopleRow {
  id: string;
  email: string;
  status: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  roles: string[];
  active_hold_count: number;
}

const ROLE_CHIPS = [
  { id: '', label: 'All' },
  { id: 'student', label: 'Students' },
  { id: 'instructor', label: 'Instructors' },
  { id: 'mechanic', label: 'Mechanics' },
  { id: 'rental_customer', label: 'Rental' },
  { id: 'admin', label: 'Admins' },
];

const STATUS_CHIPS = [
  { id: '', label: 'Active' },
  { id: 'pending', label: 'Pending' },
  { id: 'inactive', label: 'Inactive' },
  { id: 'rejected', label: 'Rejected' },
];

export function PeopleTable({
  rows,
  activeRole,
  activeStatus,
}: {
  rows: PeopleRow[];
  activeRole?: string;
  activeStatus?: string;
}) {
  const router = useRouter();
  const params = useSearchParams();

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.push(`/admin/people?${next.toString()}`);
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: '0.5rem', margin: '1rem 0', flexWrap: 'wrap' }}>
        {ROLE_CHIPS.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setParam('role', c.id)}
            style={{
              padding: '0.25rem 0.75rem',
              borderRadius: 16,
              border: '1px solid #ccc',
              background: (activeRole ?? '') === c.id ? '#0070f3' : 'white',
              color: (activeRole ?? '') === c.id ? 'white' : 'black',
              cursor: 'pointer',
            }}
          >
            {c.label}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        {STATUS_CHIPS.map((c) => (
          <button
            key={c.id || 'active'}
            type="button"
            onClick={() => setParam('status', c.id)}
            style={{
              padding: '0.25rem 0.75rem',
              borderRadius: 16,
              border: '1px solid #ccc',
              background: (activeStatus ?? '') === c.id ? '#333' : 'white',
              color: (activeStatus ?? '') === c.id ? 'white' : 'black',
              cursor: 'pointer',
              fontSize: '0.85rem',
            }}
          >
            {c.label}
          </button>
        ))}
      </div>
      {rows.length === 0 ? (
        <p style={{ color: '#888' }}>No people match these filters.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '2px solid #ddd' }}>
              <th style={{ padding: '0.5rem' }}>Name</th>
              <th style={{ padding: '0.5rem' }}>Email</th>
              <th style={{ padding: '0.5rem' }}>Roles</th>
              <th style={{ padding: '0.5rem' }}>Status</th>
              <th style={{ padding: '0.5rem' }}>Holds</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                style={{
                  borderBottom: '1px solid #eee',
                  background: r.active_hold_count > 0 ? '#fff5f5' : undefined,
                }}
              >
                <td style={{ padding: '0.5rem' }}>
                  <Link href={`/admin/people/${r.id}`}>
                    {[r.first_name, r.last_name].filter(Boolean).join(' ') || '(no name)'}
                  </Link>
                </td>
                <td style={{ padding: '0.5rem' }}>{r.email}</td>
                <td style={{ padding: '0.5rem' }}>
                  {r.roles.map((role) => (
                    <span
                      key={role}
                      style={{
                        display: 'inline-block',
                        padding: '0.1rem 0.5rem',
                        marginRight: 4,
                        borderRadius: 12,
                        background: '#eee',
                        fontSize: '0.75rem',
                      }}
                    >
                      {role}
                    </span>
                  ))}
                </td>
                <td style={{ padding: '0.5rem' }}>{r.status}</td>
                <td style={{ padding: '0.5rem', color: r.active_hold_count > 0 ? 'crimson' : undefined }}>
                  {r.active_hold_count > 0 ? `${r.active_hold_count} active` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
