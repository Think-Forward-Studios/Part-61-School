'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';

const ROLES = ['student', 'instructor', 'mechanic', 'admin', 'rental_customer'] as const;
type Role = (typeof ROLES)[number];

const CITIZENSHIP_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: '— Not set —' },
  { value: 'us_citizen', label: 'US citizen' },
  { value: 'us_national', label: 'US national' },
  { value: 'foreign_national', label: 'Foreign national' },
  { value: 'unknown', label: 'Unknown' },
];

const TSA_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: '— Not set —' },
  { value: 'not_required', label: 'Not required' },
  { value: 'pending', label: 'Pending' },
  // allow-banned-term: TSA AFSP enum value
  { value: 'approved', label: 'Approved' },
  { value: 'expired', label: 'Expired' },
];

const LABEL: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.3rem',
  fontSize: '0.68rem',
  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
  color: '#7a869a',
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
};

const INPUT: React.CSSProperties = {
  padding: '0.55rem 0.75rem',
  background: '#05070e',
  border: '1px solid #1a2238',
  borderRadius: 6,
  color: '#f7f9fc',
  fontSize: '0.88rem',
  fontFamily: 'inherit',
  letterSpacing: 'normal',
  textTransform: 'none',
  outline: 'none',
};

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
    const citizenship = String(fd.get('citizenshipStatus') ?? '') || undefined;
    const tsa = String(fd.get('tsaAfspStatus') ?? '') || undefined;
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
        citizenshipStatus: citizenship as
          | 'us_citizen'
          | 'us_national'
          | 'foreign_national'
          | 'unknown'
          | undefined,
        // allow-banned-term: TSA AFSP enum value passed through to DB
        tsaAfspStatus: tsa as 'not_required' | 'pending' | 'approved' | 'expired' | undefined,
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
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: '0.9rem',
        marginTop: '1rem',
        padding: '1.1rem 1.2rem',
        background: '#0d1220',
        border: '1px solid #1f2940',
        borderRadius: 12,
      }}
    >
      {error ? (
        <p style={{ color: '#f87171', gridColumn: '1 / -1', margin: 0, fontSize: '0.82rem' }}>
          {error}
        </p>
      ) : null}
      <label style={LABEL}>
        Role
        <select value={role} onChange={(e) => setRole(e.target.value as Role)} style={INPUT}>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </label>
      {role === 'mechanic' ? (
        <label style={LABEL}>
          Mechanic authority
          <select name="mechanicAuthority" defaultValue="none" style={INPUT}>
            <option value="none">None</option>
            <option value="a_and_p">A&amp;P</option>
            <option value="ia">IA</option>
          </select>
        </label>
      ) : null}
      <label style={LABEL}>
        Email
        <input name="email" type="email" required style={INPUT} />
      </label>
      <label style={LABEL}>
        First name
        <input name="firstName" required style={INPUT} />
      </label>
      <label style={LABEL}>
        Last name
        <input name="lastName" required style={INPUT} />
      </label>
      <label style={LABEL}>
        Phone
        <input name="phone" style={INPUT} />
      </label>
      <label style={LABEL}>
        Date of birth
        <input name="dateOfBirth" type="date" style={INPUT} />
      </label>
      <label style={LABEL}>
        Address
        <input name="addressLine1" style={INPUT} />
      </label>
      <label style={LABEL}>
        City
        <input name="city" style={INPUT} />
      </label>
      <label style={LABEL}>
        State
        <input name="state" style={INPUT} />
      </label>
      <label style={LABEL}>
        Postal code
        <input name="postalCode" style={INPUT} />
      </label>
      <label style={LABEL}>
        FAA airman cert #
        <input name="faaCert" style={INPUT} />
      </label>
      <label style={LABEL}>
        Citizenship status
        <select name="citizenshipStatus" defaultValue="" style={INPUT}>
          {CITIZENSHIP_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <label style={LABEL}>
        TSA AFSP status
        <select name="tsaAfspStatus" defaultValue="" style={INPUT}>
          {TSA_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end' }}>
        <button
          type="submit"
          disabled={busy}
          style={{
            padding: '0.55rem 1.1rem',
            background: 'linear-gradient(180deg, #fbbf24 0%, #f59e0b 100%)',
            color: '#0a0e1a',
            border: 'none',
            borderRadius: 6,
            fontSize: '0.75rem',
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            cursor: busy ? 'wait' : 'pointer',
            opacity: busy ? 0.6 : 1,
          }}
        >
          {busy ? 'Creating…' : 'Create & invite'}
        </button>
      </div>
    </form>
  );
}
