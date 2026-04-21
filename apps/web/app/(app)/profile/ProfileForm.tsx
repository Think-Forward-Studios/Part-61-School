'use client';
/**
 * ProfileForm — self-serve editor for /profile (any role).
 *
 * Loads via me.getProfile, saves via me.updateProfile. Legal-status
 * fields (citizenship_status, tsa_afsp_status) are admin-managed and
 * shown read-only. Email on the auth record is not editable here —
 * admins handle email changes because they invalidate the session.
 */
import { useEffect, useState, type FormEvent } from 'react';
import { trpc } from '@/lib/trpc/client';

type ProfileData = {
  user_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email_alt: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  date_of_birth: string | null;
  faa_airman_cert_number: string | null;
  citizenship_status: string | null;
  tsa_afsp_status: string | null;
};

const SECTION_CARD: React.CSSProperties = {
  marginTop: '1rem',
  padding: '1.1rem 1.2rem',
  background: '#0d1220',
  border: '1px solid #1f2940',
  borderRadius: 12,
};

const SECTION_H2: React.CSSProperties = {
  margin: '0 0 0.9rem',
  fontSize: '0.72rem',
  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
  color: '#7a869a',
  textTransform: 'uppercase',
  letterSpacing: '0.18em',
  fontWeight: 500,
};

const FIELD_LABEL: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.3rem',
  fontSize: '0.68rem',
  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
  color: '#7a869a',
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
};

const READONLY_PILL: React.CSSProperties = {
  display: 'inline-flex',
  padding: '0.15rem 0.55rem',
  borderRadius: 4,
  background: 'rgba(122, 134, 154, 0.14)',
  color: '#7a869a',
  fontSize: '0.62rem',
  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  fontWeight: 600,
  marginLeft: '0.45rem',
};

function ReadOnlyField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div style={FIELD_LABEL}>
      <span>
        {label}
        <span style={READONLY_PILL}>read-only</span>
      </span>
      <div
        style={{
          padding: '0.55rem 0.75rem',
          background: '#05070e',
          border: '1px solid #1a2238',
          borderRadius: 6,
          color: value ? '#cbd5e1' : '#5b6784',
          fontSize: '0.85rem',
          fontFamily: '-apple-system, BlinkMacSystemFont, system-ui, sans-serif',
          letterSpacing: 'normal',
          textTransform: 'none',
          minHeight: 'calc(1.4em + 1.1rem)',
        }}
      >
        {value ?? '—'}
      </div>
    </div>
  );
}

export function ProfileForm() {
  const query = trpc.me.getProfile.useQuery();
  const mutation = trpc.me.updateProfile.useMutation();
  const utils = trpc.useUtils();

  const [form, setForm] = useState<Partial<ProfileData>>({});
  const [status, setStatus] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);

  // Seed the form once data arrives. The `form` dependency is
  // intentionally excluded — we only want to seed on the first data
  // arrival, not every keystroke.
  const seeded = Object.keys(form).length > 0;
  useEffect(() => {
    if (query.data && !seeded) {
      setForm(query.data);
    }
  }, [query.data, seeded]);

  if (query.isLoading) {
    return (
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
        Loading profile…
      </div>
    );
  }

  const data = query.data;
  if (!data) {
    return (
      <div
        style={{
          padding: '3rem 1rem',
          textAlign: 'center',
          color: '#f87171',
          fontSize: '0.88rem',
          background: '#0d1220',
          border: '1px dashed rgba(248, 113, 113, 0.35)',
          borderRadius: 12,
        }}
      >
        Unable to load profile.
      </div>
    );
  }

  function set<K extends keyof ProfileData>(key: K, v: string) {
    setForm((f) => ({ ...f, [key]: v }));
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus(null);
    try {
      await mutation.mutateAsync({
        firstName: form.first_name ?? '',
        lastName: form.last_name ?? '',
        phone: form.phone ?? '',
        emailAlt: form.email_alt ?? '',
        addressLine1: form.address_line1 ?? '',
        addressLine2: form.address_line2 ?? '',
        city: form.city ?? '',
        state: form.state ?? '',
        postalCode: form.postal_code ?? '',
        country: form.country ?? '',
        dateOfBirth: form.date_of_birth ?? '',
        faaAirmanCertNumber: form.faa_airman_cert_number ?? '',
      });
      setStatus({ kind: 'ok', msg: 'Saved.' });
      await utils.me.getProfile.invalidate();
    } catch (err) {
      setStatus({
        kind: 'err',
        msg: err instanceof Error ? err.message : 'Save failed.',
      });
    }
  }

  const inputBase: React.CSSProperties = {
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

  const gridTwo: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
    gap: '0.9rem',
  };

  return (
    <form onSubmit={onSubmit}>
      {/* Account */}
      <section style={SECTION_CARD}>
        <h2 style={SECTION_H2}>Account</h2>
        <div style={gridTwo}>
          <ReadOnlyField label="Primary email" value={data.email} />
          <ReadOnlyField label="Citizenship status" value={data.citizenship_status} />
          <ReadOnlyField label="TSA AFSP status" value={data.tsa_afsp_status} />
        </div>
      </section>

      {/* Personal */}
      <section style={SECTION_CARD}>
        <h2 style={SECTION_H2}>Personal</h2>
        <div style={gridTwo}>
          <label style={FIELD_LABEL}>
            First name
            <input
              style={inputBase}
              value={form.first_name ?? ''}
              onChange={(e) => set('first_name', e.target.value)}
            />
          </label>
          <label style={FIELD_LABEL}>
            Last name
            <input
              style={inputBase}
              value={form.last_name ?? ''}
              onChange={(e) => set('last_name', e.target.value)}
            />
          </label>
          <label style={FIELD_LABEL}>
            Date of birth
            <input
              type="date"
              style={inputBase}
              value={form.date_of_birth ?? ''}
              onChange={(e) => set('date_of_birth', e.target.value)}
            />
          </label>
          <label style={FIELD_LABEL}>
            FAA airman cert #
            <input
              style={inputBase}
              value={form.faa_airman_cert_number ?? ''}
              onChange={(e) => set('faa_airman_cert_number', e.target.value)}
              placeholder="e.g. 1234567"
            />
          </label>
        </div>
      </section>

      {/* Contact */}
      <section style={SECTION_CARD}>
        <h2 style={SECTION_H2}>Contact</h2>
        <div style={gridTwo}>
          <label style={FIELD_LABEL}>
            Phone
            <input
              type="tel"
              style={inputBase}
              value={form.phone ?? ''}
              onChange={(e) => set('phone', e.target.value)}
              placeholder="+1 555 555 5555"
            />
          </label>
          <label style={FIELD_LABEL}>
            Alternate email
            <input
              type="email"
              style={inputBase}
              value={form.email_alt ?? ''}
              onChange={(e) => set('email_alt', e.target.value)}
              placeholder="optional"
            />
          </label>
        </div>
      </section>

      {/* Address */}
      <section style={SECTION_CARD}>
        <h2 style={SECTION_H2}>Address</h2>
        <div style={{ display: 'grid', gap: '0.9rem' }}>
          <label style={FIELD_LABEL}>
            Address line 1
            <input
              style={inputBase}
              value={form.address_line1 ?? ''}
              onChange={(e) => set('address_line1', e.target.value)}
            />
          </label>
          <label style={FIELD_LABEL}>
            Address line 2
            <input
              style={inputBase}
              value={form.address_line2 ?? ''}
              onChange={(e) => set('address_line2', e.target.value)}
            />
          </label>
          <div style={gridTwo}>
            <label style={FIELD_LABEL}>
              City
              <input
                style={inputBase}
                value={form.city ?? ''}
                onChange={(e) => set('city', e.target.value)}
              />
            </label>
            <label style={FIELD_LABEL}>
              State / region
              <input
                style={inputBase}
                value={form.state ?? ''}
                onChange={(e) => set('state', e.target.value)}
              />
            </label>
            <label style={FIELD_LABEL}>
              Postal code
              <input
                style={inputBase}
                value={form.postal_code ?? ''}
                onChange={(e) => set('postal_code', e.target.value)}
              />
            </label>
            <label style={FIELD_LABEL}>
              Country
              <input
                style={inputBase}
                value={form.country ?? ''}
                onChange={(e) => set('country', e.target.value)}
              />
            </label>
          </div>
        </div>
      </section>

      {/* Save bar */}
      <div
        style={{
          marginTop: '1.25rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.9rem',
          flexWrap: 'wrap',
        }}
      >
        <button
          type="submit"
          disabled={mutation.isPending}
          style={{
            padding: '0.55rem 1.1rem',
            background: 'linear-gradient(180deg, #fbbf24 0%, #f59e0b 100%)',
            color: '#0a0e1a',
            border: 'none',
            borderRadius: 8,
            fontSize: '0.78rem',
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            cursor: mutation.isPending ? 'wait' : 'pointer',
            opacity: mutation.isPending ? 0.6 : 1,
            boxShadow: '0 4px 14px rgba(251, 191, 36, 0.2)',
          }}
        >
          {mutation.isPending ? 'Saving…' : 'Save changes'}
        </button>
        {status ? (
          <span
            style={{
              color: status.kind === 'ok' ? '#34d399' : '#f87171',
              fontFamily: '"JetBrains Mono", ui-monospace, monospace',
              fontSize: '0.75rem',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            {status.msg}
          </span>
        ) : null}
      </div>
    </form>
  );
}
