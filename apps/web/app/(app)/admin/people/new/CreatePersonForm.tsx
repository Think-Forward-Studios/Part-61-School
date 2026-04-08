'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';

const ROLES = ['student', 'instructor', 'mechanic', 'admin', 'rental_customer'] as const;
type Role = (typeof ROLES)[number];

export function CreatePersonForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [role, setRole] = useState<Role>('student');
  const create = trpc.admin.people.create.useMutation();

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    try {
      const result = await create.mutateAsync({
        email: String(fd.get('email') ?? ''),
        role,
        firstName: String(fd.get('firstName') ?? ''),
        lastName: String(fd.get('lastName') ?? ''),
        phone: (fd.get('phone') as string) || null,
        dateOfBirth: (fd.get('dateOfBirth') as string) || null,
        addressLine1: (fd.get('addressLine1') as string) || null,
        city: (fd.get('city') as string) || null,
        state: (fd.get('state') as string) || null,
        postalCode: (fd.get('postalCode') as string) || null,
        faaAirmanCertNumber: (fd.get('faaCert') as string) || null,
        mechanicAuthority:
          role === 'mechanic'
            ? ((fd.get('mechanicAuthority') as 'none' | 'a_and_p' | 'ia') ?? 'none')
            : 'none',
      });
      router.push(`/admin/people/${result.userId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '1rem' }}
    >
      {error ? <p style={{ color: 'crimson' }}>{error}</p> : null}
      <label>
        Role{' '}
        <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </label>
      {role === 'mechanic' ? (
        <label>
          Mechanic authority{' '}
          <select name="mechanicAuthority" defaultValue="none">
            <option value="none">None</option>
            <option value="a_and_p">A&amp;P</option>
            <option value="ia">IA</option>
          </select>
        </label>
      ) : null}
      <label>
        Email <input name="email" type="email" required />
      </label>
      <label>
        First name <input name="firstName" required />
      </label>
      <label>
        Last name <input name="lastName" required />
      </label>
      <label>
        Phone <input name="phone" />
      </label>
      <label>
        Date of birth <input name="dateOfBirth" type="date" />
      </label>
      <label>
        Address <input name="addressLine1" />
      </label>
      <label>
        City <input name="city" />
      </label>
      <label>
        State <input name="state" />
      </label>
      <label>
        Postal code <input name="postalCode" />
      </label>
      <label>
        FAA airman cert # <input name="faaCert" />
      </label>
      <button type="submit" disabled={busy}>
        {busy ? 'Creating…' : 'Create & invite'}
      </button>
    </form>
  );
}
