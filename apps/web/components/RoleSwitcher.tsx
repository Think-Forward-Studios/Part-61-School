'use client';
import { switchRole } from '@/app/(app)/switch-role/actions';

type Role =
  | 'student'
  | 'instructor'
  | 'mechanic'
  | 'admin'
  | 'rental_customer';

export function RoleSwitcher({ roles, active }: { roles: Role[]; active: Role }) {
  return (
    <form action={switchRole} style={{ display: 'inline-flex', gap: '0.5rem' }}>
      <label>
        Active role
        <select name="role" defaultValue={active}>
          {roles.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </label>
      <button type="submit">Switch</button>
    </form>
  );
}
