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
    <section style={{ marginTop: '1rem', padding: '1rem', border: '1px solid #ddd', borderRadius: 6 }}>
      <h2>Roles</h2>
      {error ? <p style={{ color: 'crimson' }}>{error}</p> : null}
      <div style={{ marginBottom: '1rem' }}>
        {roles.length === 0 ? (
          <span style={{ color: '#888' }}>No roles assigned.</span>
        ) : (
          roles.map((r) => (
            <span
              key={r.role}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem',
                padding: '0.25rem 0.75rem',
                marginRight: 6,
                borderRadius: 16,
                background: '#e0e7ff',
                fontSize: '0.85rem',
              }}
            >
              {r.role}
              {r.role === 'mechanic' && r.mechanicAuthority !== 'none' ? ` (${r.mechanicAuthority})` : ''}
              <button
                type="button"
                onClick={() => onRemove(r.role)}
                style={{ background: 'none', border: 0, color: '#c00', cursor: 'pointer' }}
              >
                ×
              </button>
            </span>
          ))
        )}
      </div>
      <form onSubmit={onAssign} style={{ display: 'flex', gap: '0.5rem' }}>
        <select value={newRole} onChange={(e) => setNewRole(e.target.value as Role)}>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        {newRole === 'mechanic' ? (
          <select name="mechanicAuthority" defaultValue="none">
            <option value="none">none</option>
            <option value="a_and_p">A&amp;P</option>
            <option value="ia">IA</option>
          </select>
        ) : null}
        <button type="submit">Assign role</button>
      </form>
    </section>
  );
}
