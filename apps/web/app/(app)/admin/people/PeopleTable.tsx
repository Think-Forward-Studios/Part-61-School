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

// Role color palette (matches the rest of the aviation design system)
const ROLE_HUE: Record<string, string> = {
  admin: '#f97316', // orange — OPS
  instructor: '#38bdf8', // sky — CFI
  student: '#34d399', // mint — STU
  mechanic: '#a78bfa', // violet — MX
  rental_customer: '#7a869a', // dim — REN
};

const STATUS_HUE: Record<string, { bg: string; fg: string }> = {
  active: { bg: 'rgba(52, 211, 153, 0.12)', fg: '#34d399' },
  pending: { bg: 'rgba(251, 191, 36, 0.12)', fg: '#fbbf24' },
  inactive: { bg: 'rgba(122, 134, 154, 0.14)', fg: '#7a869a' },
  rejected: { bg: 'rgba(248, 113, 113, 0.14)', fg: '#f87171' },
};

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
      {/* Role filter chips */}
      <div
        style={{
          display: 'flex',
          gap: '0.4rem',
          margin: '0 0 0.6rem',
          flexWrap: 'wrap',
        }}
      >
        {ROLE_CHIPS.map((c) => {
          const isActive = (activeRole ?? '') === c.id;
          const hue = ROLE_HUE[c.id] ?? '#38bdf8';
          return (
            <button
              key={c.id || 'all'}
              type="button"
              onClick={() => setParam('role', c.id)}
              style={{
                padding: '0.35rem 0.85rem',
                borderRadius: 999,
                border: `1px solid ${isActive ? hue : '#1f2940'}`,
                background: isActive ? `${hue}22` : '#0d1220',
                color: isActive ? hue : '#cbd5e1',
                cursor: 'pointer',
                fontSize: '0.78rem',
                fontWeight: isActive ? 600 : 400,
                letterSpacing: isActive ? '0.05em' : undefined,
                transition: 'background 0.15s ease, border-color 0.15s ease, color 0.15s ease',
              }}
            >
              {c.label}
            </button>
          );
        })}
      </div>
      {/* Status filter chips */}
      <div
        style={{
          display: 'flex',
          gap: '0.4rem',
          marginBottom: '1.25rem',
          flexWrap: 'wrap',
        }}
      >
        {STATUS_CHIPS.map((c) => {
          const isActive = (activeStatus ?? '') === c.id;
          return (
            <button
              key={c.id || 'active'}
              type="button"
              onClick={() => setParam('status', c.id)}
              style={{
                padding: '0.3rem 0.75rem',
                borderRadius: 6,
                border: `1px solid ${isActive ? '#fbbf24' : '#1a2238'}`,
                background: isActive ? 'rgba(251, 191, 36, 0.1)' : 'transparent',
                color: isActive ? '#fbbf24' : '#7a869a',
                cursor: 'pointer',
                fontSize: '0.72rem',
                fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                fontWeight: 500,
              }}
            >
              {c.label}
            </button>
          );
        })}
      </div>

      {rows.length === 0 ? (
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
          No people match these filters.
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
                {['Name', 'Email', 'Roles', 'Status', 'Holds', ''].map((h, i) => (
                  <th
                    key={h || `actions-${i}`}
                    style={{
                      textAlign: i === 5 ? 'right' : 'left',
                      padding: '0.65rem 0.9rem',
                      fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                      fontSize: '0.68rem',
                      letterSpacing: '0.15em',
                      color: '#7a869a',
                      textTransform: 'uppercase',
                      fontWeight: 500,
                      borderBottom: '1px solid #1f2940',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const isFlagged = r.active_hold_count > 0;
                const statusTone = STATUS_HUE[r.status] ??
                  STATUS_HUE.inactive ?? { bg: '#1a2238', fg: '#7a869a' };
                return (
                  <tr
                    key={r.id}
                    style={{
                      borderBottom: '1px solid #161d30',
                      background: isFlagged ? 'rgba(248, 113, 113, 0.05)' : undefined,
                    }}
                  >
                    <td style={{ padding: '0.7rem 0.9rem' }}>
                      <Link
                        href={`/admin/people/${r.id}`}
                        style={{
                          color: '#f7f9fc',
                          textDecoration: 'none',
                          fontWeight: 500,
                        }}
                      >
                        {[r.first_name, r.last_name].filter(Boolean).join(' ') || (
                          <span style={{ color: '#5b6784', fontStyle: 'italic' }}>(no name)</span>
                        )}
                      </Link>
                    </td>
                    <td
                      style={{
                        padding: '0.7rem 0.9rem',
                        color: '#cbd5e1',
                        fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                        fontSize: '0.78rem',
                      }}
                    >
                      {r.email}
                    </td>
                    <td style={{ padding: '0.7rem 0.9rem' }}>
                      <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                        {r.roles.map((role) => {
                          const hue = ROLE_HUE[role] ?? '#7a869a';
                          return (
                            <span
                              key={role}
                              style={{
                                display: 'inline-flex',
                                padding: '0.18rem 0.55rem',
                                borderRadius: 999,
                                background: `${hue}1f`,
                                color: hue,
                                border: `1px solid ${hue}44`,
                                fontSize: '0.68rem',
                                fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                                letterSpacing: '0.08em',
                                textTransform: 'uppercase',
                                fontWeight: 600,
                              }}
                            >
                              {role.replace('_', ' ')}
                            </span>
                          );
                        })}
                      </div>
                    </td>
                    <td style={{ padding: '0.7rem 0.9rem' }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          padding: '0.15rem 0.5rem',
                          borderRadius: 4,
                          background: statusTone.bg,
                          color: statusTone.fg,
                          fontSize: '0.68rem',
                          fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                          letterSpacing: '0.1em',
                          textTransform: 'uppercase',
                          fontWeight: 600,
                        }}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td
                      style={{
                        padding: '0.7rem 0.9rem',
                        color: isFlagged ? '#f87171' : '#5b6784',
                        fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                        fontSize: '0.78rem',
                      }}
                    >
                      {isFlagged ? `${r.active_hold_count} active` : '—'}
                    </td>
                    <td style={{ padding: '0.5rem 0.9rem', textAlign: 'right' }}>
                      <Link
                        href={`/admin/people/${r.id}`}
                        style={{
                          display: 'inline-flex',
                          padding: '0.3rem 0.75rem',
                          background: 'rgba(56, 189, 248, 0.12)',
                          color: '#38bdf8',
                          border: '1px solid rgba(56, 189, 248, 0.3)',
                          borderRadius: 6,
                          fontSize: '0.68rem',
                          fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                          letterSpacing: '0.1em',
                          textTransform: 'uppercase',
                          fontWeight: 600,
                          textDecoration: 'none',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        Edit
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
