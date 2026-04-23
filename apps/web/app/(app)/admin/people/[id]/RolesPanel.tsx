'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';

const ROLES = ['student', 'instructor', 'mechanic', 'admin', 'rental_customer'] as const;
type Role = (typeof ROLES)[number];

interface RoleRow {
  role: string;
  mechanicAuthority: string;
}

/**
 * Role color tokens — mirror the palette used by RoleSubNav and the
 * top-header role pill so the same person's "admin" chip reads the
 * same colour everywhere in the app.
 */
const ROLE_COLORS: Record<string, { fg: string; bg: string; border: string }> = {
  admin: {
    fg: '#fdba74',
    bg: 'rgba(249, 115, 22, 0.14)',
    border: 'rgba(249, 115, 22, 0.4)',
  },
  instructor: {
    fg: '#7dd3fc',
    bg: 'rgba(56, 189, 248, 0.14)',
    border: 'rgba(56, 189, 248, 0.4)',
  },
  student: {
    fg: '#6ee7b7',
    bg: 'rgba(52, 211, 153, 0.14)',
    border: 'rgba(52, 211, 153, 0.4)',
  },
  mechanic: {
    fg: '#c4b5fd',
    bg: 'rgba(167, 139, 250, 0.14)',
    border: 'rgba(167, 139, 250, 0.4)',
  },
  rental_customer: {
    fg: '#cbd5e1',
    bg: 'rgba(122, 134, 154, 0.14)',
    border: 'rgba(122, 134, 154, 0.4)',
  },
};

const ROLE_LABEL: Record<string, string> = {
  admin: 'Admin',
  instructor: 'Instructor',
  student: 'Student',
  mechanic: 'Mechanic',
  rental_customer: 'Rental',
};

export function RolesPanel({ userId, roles }: { userId: string; roles: RoleRow[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [newRole, setNewRole] = useState<Role>('student');
  const assign = trpc.admin.people.assignRole.useMutation();
  const remove = trpc.admin.people.removeRole.useMutation();

  async function onAssign(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    try {
      await assign.mutateAsync({
        userId,
        role: newRole,
        mechanicAuthority:
          newRole === 'mechanic'
            ? ((fd.get('mechanicAuthority') as 'none' | 'a_and_p' | 'ia') ?? 'none')
            : 'none',
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Assign failed');
    }
  }

  async function onRemove(role: string) {
    if (!confirm(`Remove role ${role}?`)) return;
    try {
      await remove.mutateAsync({ userId, role: role as Role });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Remove failed');
    }
  }

  return (
    <section
      style={{
        marginTop: '1.25rem',
        padding: '1.1rem 1.25rem',
        background: 'rgba(18, 24, 38, 0.6)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 12,
      }}
    >
      <h2
        style={{
          margin: 0,
          fontSize: '0.72rem',
          fontFamily: '"JetBrains Mono", ui-monospace, monospace',
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: '#7a869a',
          fontWeight: 600,
        }}
      >
        Roles
      </h2>

      {error ? (
        <p style={{ color: '#f87171', fontSize: '0.82rem', marginTop: '0.5rem' }}>{error}</p>
      ) : null}

      <div
        style={{
          marginTop: '0.85rem',
          marginBottom: '0.85rem',
          display: 'flex',
          gap: '0.45rem',
          flexWrap: 'wrap',
        }}
      >
        {roles.length === 0 ? (
          <span style={{ color: '#7a869a', fontSize: '0.85rem' }}>No roles assigned.</span>
        ) : (
          roles.map((r) => {
            const palette = ROLE_COLORS[r.role] ?? ROLE_COLORS.rental_customer!;
            const label = ROLE_LABEL[r.role] ?? r.role;
            return (
              <span
                key={r.role}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  padding: '0.3rem 0.6rem 0.3rem 0.75rem',
                  borderRadius: 999,
                  background: palette.bg,
                  border: `1px solid ${palette.border}`,
                  color: palette.fg,
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  letterSpacing: '0.02em',
                }}
              >
                {label}
                {r.role === 'mechanic' && r.mechanicAuthority !== 'none'
                  ? ` · ${r.mechanicAuthority.toUpperCase().replace('_AND_', '&')}`
                  : ''}
                <button
                  type="button"
                  onClick={() => onRemove(r.role)}
                  aria-label={`Remove ${label} role`}
                  title={`Remove ${label} role`}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 18,
                    height: 18,
                    background: 'rgba(0,0,0,0.25)',
                    border: `1px solid ${palette.border}`,
                    color: palette.fg,
                    borderRadius: 999,
                    cursor: 'pointer',
                    fontSize: '0.75rem',
                    lineHeight: 1,
                    fontWeight: 700,
                  }}
                >
                  ×
                </button>
              </span>
            );
          })
        )}
      </div>

      <form onSubmit={onAssign} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <select
          value={newRole}
          onChange={(e) => setNewRole(e.target.value as Role)}
          style={selectStyle}
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r] ?? r}
            </option>
          ))}
        </select>
        {newRole === 'mechanic' ? (
          <select name="mechanicAuthority" defaultValue="none" style={selectStyle}>
            <option value="none">None</option>
            <option value="a_and_p">A&amp;P</option>
            <option value="ia">IA</option>
          </select>
        ) : null}
        <button type="submit" style={assignButtonStyle} disabled={assign.isPending}>
          {assign.isPending ? 'Assigning…' : 'Assign role'}
        </button>
      </form>
    </section>
  );
}

const selectStyle: React.CSSProperties = {
  height: '2.3rem',
  background: 'rgba(9, 13, 24, 0.85)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 8,
  color: '#e2e8f0',
  padding: '0 0.75rem',
  fontSize: '0.88rem',
  outline: 'none',
};

const assignButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  height: '2.3rem',
  padding: '0 1rem',
  background: 'linear-gradient(135deg, #fbbf24, #f59e0b)',
  color: '#0a0e1a',
  border: 'none',
  borderRadius: 8,
  fontSize: '0.85rem',
  fontWeight: 700,
  cursor: 'pointer',
  letterSpacing: '0.01em',
};
