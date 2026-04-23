'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';

type Severity = 'info' | 'watch' | 'grounding';

/**
 * "+ New squawk" dialog for /admin/squawks.
 *
 * Posts to dispatch.openSquawk — the same mutation the flight
 * close-out flow uses when the instructor notes a defect. This
 * entrypoint lets admins/mechanics write one up standalone (pre-flight
 * finding, ramp walk-around, shop-floor inspection) without having to
 * be inside a reservation.
 *
 * Grounding severity also stamps aircraft.grounded_at — that's the
 * mutation's responsibility, not ours.
 */
export function NewSquawkDialog({ triggerLabel = '+ New squawk' }: { triggerLabel?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load fleet lazily — only once the dialog has been opened — so the
  // squawks page itself doesn't pay the roundtrip cost on every visit.
  const fleet = trpc.admin.aircraft.list.useQuery({ limit: 500, offset: 0 }, { enabled: open });

  const openMut = trpc.dispatch.openSquawk.useMutation();

  // Close on Escape for keyboard users.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const aircraftId = String(fd.get('aircraftId') ?? '');
    const title = String(fd.get('title') ?? '').trim();
    const description = (fd.get('description') as string)?.trim() || null;
    const severity = (fd.get('severity') as Severity) ?? 'info';

    if (!aircraftId) {
      setError('Pick an aircraft.');
      return;
    }
    if (!title) {
      setError('Title is required.');
      return;
    }

    try {
      await openMut.mutateAsync({
        aircraftId,
        title,
        description,
        severity,
      });
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open squawk.');
    }
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} style={triggerButton}>
        {triggerLabel}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Open a new squawk"
          onClick={(e) => {
            // Click outside the dialog closes it.
            if (e.target === e.currentTarget) setOpen(false);
          }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(4, 8, 18, 0.72)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
            backdropFilter: 'blur(3px)',
          }}
        >
          <form
            onSubmit={onSubmit}
            style={{
              width: '100%',
              maxWidth: 560,
              background: '#0d1220',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 14,
              padding: '1.25rem 1.35rem',
              boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
            }}
          >
            <div>
              <div style={eyebrow}>Maintenance</div>
              <h2 style={{ margin: '0.25rem 0 0', color: '#f7f9fc', fontSize: '1.1rem' }}>
                Open a squawk
              </h2>
              <p
                style={{
                  margin: '0.3rem 0 0',
                  fontSize: '0.82rem',
                  color: '#94a3b8',
                  lineHeight: 1.45,
                }}
              >
                Writes a defect to the selected aircraft. Choosing{' '}
                <strong style={{ color: '#fca5a5' }}>grounding</strong> will also flip the aircraft
                to Not Airworthy until the squawk is returned to service.
              </p>
            </div>

            <Field label="Aircraft">
              <select
                name="aircraftId"
                required
                style={inputStyle}
                defaultValue=""
                disabled={fleet.isLoading}
              >
                <option value="" disabled>
                  {fleet.isLoading ? 'Loading fleet…' : 'Select an aircraft…'}
                </option>
                {(fleet.data ?? []).map((a) => {
                  const mm = [a.make, a.model].filter(Boolean).join(' ');
                  return (
                    <option key={a.id} value={a.id}>
                      {a.tailNumber}
                      {mm ? ` — ${mm}` : ''}
                    </option>
                  );
                })}
              </select>
            </Field>

            <Field label="Severity">
              <select name="severity" defaultValue="info" style={inputStyle}>
                <option value="info">info — note for next mechanic</option>
                <option value="watch">watch — monitor, still airworthy</option>
                <option value="grounding">grounding — aircraft goes Not Airworthy</option>
              </select>
            </Field>

            <Field label="Title" hint="Short one-liner. Required.">
              <input
                name="title"
                required
                maxLength={200}
                placeholder="#2 alternator intermittent"
                style={inputStyle}
              />
            </Field>

            <Field label="Description">
              <textarea
                name="description"
                rows={4}
                maxLength={5000}
                placeholder="Details, when it started, any troubleshooting already attempted…"
                style={{
                  ...inputStyle,
                  height: 'auto',
                  padding: '0.55rem 0.75rem',
                  minHeight: '5rem',
                  resize: 'vertical',
                  fontFamily: 'inherit',
                }}
              />
            </Field>

            {error ? <div style={{ color: '#f87171', fontSize: '0.82rem' }}>{error}</div> : null}

            <div
              style={{
                display: 'flex',
                gap: '0.5rem',
                justifyContent: 'flex-end',
                alignItems: 'center',
                marginTop: '0.25rem',
              }}
            >
              <button type="button" onClick={() => setOpen(false)} style={ghostButton}>
                Cancel
              </button>
              <button type="submit" style={primaryButton} disabled={openMut.isPending}>
                {openMut.isPending ? 'Opening…' : 'Open squawk'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
      <label style={labelStyle}>{label}</label>
      {children}
      {hint ? <span style={{ fontSize: '0.72rem', color: '#7a869a' }}>{hint}</span> : null}
    </div>
  );
}

// --- styles --------------------------------------------------------------

const eyebrow: React.CSSProperties = {
  fontSize: '0.66rem',
  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  color: '#7a869a',
  fontWeight: 600,
};

const labelStyle: React.CSSProperties = {
  fontSize: '0.68rem',
  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: '#7a869a',
  fontWeight: 600,
};

const inputStyle: React.CSSProperties = {
  height: '2.3rem',
  background: 'rgba(9, 13, 24, 0.85)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 8,
  color: '#e2e8f0',
  padding: '0 0.75rem',
  fontSize: '0.88rem',
  outline: 'none',
  width: '100%',
};

const triggerButton: React.CSSProperties = {
  padding: '0.55rem 0.95rem',
  background: 'linear-gradient(180deg, #fbbf24 0%, #f59e0b 100%)',
  color: '#0a0e1a',
  borderRadius: 8,
  border: 'none',
  textDecoration: 'none',
  fontSize: '0.78rem',
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  boxShadow: '0 4px 14px rgba(251, 191, 36, 0.25), 0 1px 0 rgba(255, 255, 255, 0.15) inset',
  cursor: 'pointer',
};

const primaryButton: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  height: '2.3rem',
  padding: '0 1rem',
  background: 'linear-gradient(135deg, #fbbf24, #f59e0b)',
  color: '#0a0e1a',
  border: 'none',
  borderRadius: 8,
  fontSize: '0.88rem',
  fontWeight: 700,
  cursor: 'pointer',
  letterSpacing: '0.01em',
};

const ghostButton: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  height: '2.3rem',
  padding: '0 1rem',
  background: 'transparent',
  border: '1px solid rgba(255,255,255,0.14)',
  borderRadius: 8,
  color: '#cbd5e1',
  fontSize: '0.82rem',
  fontWeight: 600,
  cursor: 'pointer',
};
