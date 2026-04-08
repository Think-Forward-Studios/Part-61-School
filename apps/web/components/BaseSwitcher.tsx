import { switchBase } from '@/app/(app)/switch-base/actions';

export interface BaseOption {
  id: string;
  name: string;
}

/**
 * BaseSwitcher (MUL-02).
 *
 * Server Component - renders a form that posts to the switchBase
 * server action. Only renders when the caller has more than one
 * user_base row. When the user has exactly one base (the common v1
 * case), this returns null and the switcher is invisible.
 */
export function BaseSwitcher({
  availableBases,
  activeBaseId,
}: {
  availableBases: BaseOption[];
  activeBaseId: string | null;
}) {
  if (availableBases.length <= 1) return null;
  return (
    <form action={switchBase} style={{ display: 'inline-flex', gap: '0.5rem' }}>
      <label>
        Active base{' '}
        <select name="baseId" defaultValue={activeBaseId ?? ''}>
          {availableBases.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </label>
      <button type="submit">Switch base</button>
    </form>
  );
}
