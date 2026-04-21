'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';

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

const SECTION: React.CSSProperties = {
  marginTop: '1rem',
  padding: '1rem 1.1rem',
  background: '#0d1220',
  border: '1px solid #1f2940',
  borderRadius: 12,
};

const SECTION_H2: React.CSSProperties = {
  margin: '0 0 0.75rem',
  fontSize: '0.75rem',
  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
  color: '#7a869a',
  textTransform: 'uppercase',
  letterSpacing: '0.15em',
  fontWeight: 500,
};

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

export function EditProfileForm({
  userId,
  initial,
}: {
  userId: string;
  initial: {
    email: string;
    firstName: string;
    lastName: string;
    phone: string;
    notes: string;
    citizenshipStatus?: string | null;
    tsaAfspStatus?: string | null;
  };
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const update = trpc.admin.people.update.useMutation();
  const softDelete = trpc.admin.people.softDelete.useMutation();

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setOk(false);
    const fd = new FormData(e.currentTarget);
    const citizenship = String(fd.get('citizenshipStatus') ?? '') || undefined;
    const tsa = String(fd.get('tsaAfspStatus') ?? '') || undefined;
    try {
      await update.mutateAsync({
        userId,
        email: String(fd.get('email') ?? ''),
        firstName: String(fd.get('firstName') ?? ''),
        lastName: String(fd.get('lastName') ?? ''),
        phone: (fd.get('phone') as string) || null,
        notes: (fd.get('notes') as string) || null,
        citizenshipStatus: citizenship as
          | 'us_citizen'
          | 'us_national'
          | 'foreign_national'
          | 'unknown'
          | undefined,
        // allow-banned-term: TSA AFSP enum value passed through to DB
        tsaAfspStatus: tsa as 'not_required' | 'pending' | 'approved' | 'expired' | undefined,
      });
      setOk(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    }
  }

  async function onSoftDelete() {
    if (!confirm('Soft-delete this user? They will lose access.')) return;
    try {
      await softDelete.mutateAsync({ userId });
      router.push('/admin/people');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  const inputStyle: React.CSSProperties = {
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

  return (
    <section style={SECTION}>
      <h2 style={SECTION_H2}>Profile</h2>
      <form
        onSubmit={onSubmit}
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: '0.9rem',
        }}
      >
        {error ? (
          <p style={{ color: '#f87171', gridColumn: '1 / -1', margin: 0, fontSize: '0.82rem' }}>
            {error}
          </p>
        ) : null}
        {ok ? (
          <p style={{ color: '#34d399', gridColumn: '1 / -1', margin: 0, fontSize: '0.82rem' }}>
            Saved.
          </p>
        ) : null}
        <label style={LABEL}>
          Email
          <input
            name="email"
            type="email"
            defaultValue={initial.email}
            required
            style={inputStyle}
          />
        </label>
        <label style={LABEL}>
          First name
          <input name="firstName" defaultValue={initial.firstName} style={inputStyle} />
        </label>
        <label style={LABEL}>
          Last name
          <input name="lastName" defaultValue={initial.lastName} style={inputStyle} />
        </label>
        <label style={LABEL}>
          Phone
          <input name="phone" defaultValue={initial.phone} style={inputStyle} />
        </label>
        <label style={LABEL}>
          Citizenship status
          <select
            name="citizenshipStatus"
            defaultValue={initial.citizenshipStatus ?? ''}
            style={inputStyle}
          >
            {CITIZENSHIP_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label style={LABEL}>
          TSA AFSP status
          <select
            name="tsaAfspStatus"
            defaultValue={initial.tsaAfspStatus ?? ''}
            style={inputStyle}
          >
            {TSA_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label style={{ ...LABEL, gridColumn: '1 / -1' }}>
          Notes
          <textarea
            name="notes"
            defaultValue={initial.notes}
            rows={3}
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </label>
        <div
          style={{
            gridColumn: '1 / -1',
            display: 'flex',
            gap: '0.5rem',
            justifyContent: 'flex-end',
            marginTop: '0.25rem',
          }}
        >
          <button
            type="button"
            onClick={onSoftDelete}
            style={{
              padding: '0.5rem 0.95rem',
              background: 'transparent',
              color: '#f87171',
              border: '1px solid rgba(248, 113, 113, 0.35)',
              borderRadius: 6,
              fontSize: '0.72rem',
              fontFamily: '"JetBrains Mono", ui-monospace, monospace',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Soft-delete user
          </button>
          <button
            type="submit"
            disabled={update.isPending}
            style={{
              padding: '0.5rem 0.95rem',
              background: 'linear-gradient(180deg, #fbbf24 0%, #f59e0b 100%)',
              color: '#0a0e1a',
              border: 'none',
              borderRadius: 6,
              fontSize: '0.72rem',
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              cursor: update.isPending ? 'wait' : 'pointer',
              opacity: update.isPending ? 0.6 : 1,
            }}
          >
            {update.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </section>
  );
}
