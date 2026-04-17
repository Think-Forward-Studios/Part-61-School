'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Antonio, JetBrains_Mono } from 'next/font/google';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

const antonio = Antonio({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  display: 'swap',
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  display: 'swap',
});

const TEST_ACCOUNTS = [
  { role: 'Admin', email: 'admin@tfs.test', hue: '#f97316', callsign: 'OPS' },
  { role: 'Instructor', email: 'instructor@tfs.test', hue: '#38bdf8', callsign: 'CFI' },
  { role: 'Student', email: 'student@tfs.test', hue: '#34d399', callsign: 'STU' },
  { role: 'Mechanic', email: 'mechanic@tfs.test', hue: '#a78bfa', callsign: 'MX' },
] as const;

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createSupabaseBrowserClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setLoading(false);
    if (signInError) {
      setError(signInError.message);
      return;
    }
    router.push('/');
    router.refresh();
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem 1.5rem',
        background:
          'radial-gradient(ellipse 100% 70% at 50% 0%, #16213a 0%, #0a0e1a 55%, #05070e 100%)',
        color: '#e8ecf5',
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Sectional-chart grid overlay */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage:
            'linear-gradient(rgba(56, 189, 248, 0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(56, 189, 248, 0.04) 1px, transparent 1px)',
          backgroundSize: '56px 56px',
          maskImage: 'radial-gradient(ellipse 80% 60% at 50% 40%, black 30%, transparent 80%)',
          WebkitMaskImage:
            'radial-gradient(ellipse 80% 60% at 50% 40%, black 30%, transparent 80%)',
          pointerEvents: 'none',
        }}
      />
      {/* Horizon glow */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: '-20%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '120%',
          height: '60%',
          background:
            'radial-gradient(ellipse at center, rgba(251, 191, 36, 0.08) 0%, transparent 60%)',
          pointerEvents: 'none',
        }}
      />

      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 460,
          display: 'flex',
          flexDirection: 'column',
          gap: '1.75rem',
        }}
      >
        {/* Wordmark */}
        <header style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <div
            className={mono.className}
            style={{
              fontSize: '0.7rem',
              letterSpacing: '0.35em',
              color: '#fbbf24',
              textTransform: 'uppercase',
              fontWeight: 500,
            }}
          >
            <span style={{ color: '#fbbf24' }}>◆</span>{' '}
            <span style={{ color: '#7a869a' }}>Part 61 · Flight Operations</span>
          </div>
          <h1
            className={antonio.className}
            style={{
              margin: 0,
              fontSize: 'clamp(2.25rem, 4vw, 2.75rem)',
              fontWeight: 700,
              lineHeight: 1,
              letterSpacing: '-0.01em',
              color: '#f7f9fc',
            }}
          >
            TFS <span style={{ color: '#fbbf24' }}>Flight School</span>
          </h1>
          <p
            style={{
              margin: '0.5rem 0 0',
              color: '#7a869a',
              fontSize: '0.9rem',
            }}
          >
            Sign in to dispatch, train, or fly.
          </p>
        </header>

        {/* Sign-in card */}
        <form
          onSubmit={onSubmit}
          style={{
            background: 'linear-gradient(180deg, #121826 0%, #0d1220 100%)',
            border: '1px solid #1f2940',
            borderRadius: 14,
            padding: '1.75rem',
            boxShadow:
              '0 1px 0 rgba(255,255,255,0.04) inset, 0 20px 60px rgba(0,0,0,0.45), 0 0 0 1px rgba(251,191,36,0.05)',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.1rem',
          }}
        >
          <Field
            label="Email"
            monoClass={mono.className}
            input={
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="you@school.test"
                style={inputStyle}
              />
            }
          />
          <Field
            label="Password"
            monoClass={mono.className}
            rightSlot={
              <Link
                href="/reset-password"
                style={{
                  fontSize: '0.72rem',
                  color: '#38bdf8',
                  textDecoration: 'none',
                  letterSpacing: '0.05em',
                }}
              >
                Forgot?
              </Link>
            }
            input={
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                placeholder="••••••••"
                style={inputStyle}
              />
            }
          />

          {error ? (
            <div
              role="alert"
              className={mono.className}
              style={{
                padding: '0.65rem 0.85rem',
                background: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.35)',
                borderLeft: '3px solid #ef4444',
                borderRadius: 6,
                color: '#fca5a5',
                fontSize: '0.8rem',
                letterSpacing: '0.02em',
              }}
            >
              <span style={{ color: '#ef4444', marginRight: '0.5rem' }}>✕</span>
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            style={{
              position: 'relative',
              marginTop: '0.25rem',
              padding: '0.9rem 1rem',
              background: loading ? '#78350f' : 'linear-gradient(180deg, #fbbf24 0%, #f59e0b 100%)',
              color: '#0a0e1a',
              border: 'none',
              borderRadius: 8,
              fontSize: '0.95rem',
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
              boxShadow: loading
                ? 'none'
                : '0 4px 14px rgba(251, 191, 36, 0.35), 0 1px 0 rgba(255,255,255,0.15) inset',
              transition: 'transform 0.08s ease, box-shadow 0.2s ease',
            }}
            onMouseDown={(e) => {
              if (!loading) e.currentTarget.style.transform = 'translateY(1px)';
            }}
            onMouseUp={(e) => {
              e.currentTarget.style.transform = '';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = '';
            }}
          >
            {loading ? 'Authorizing…' : 'Sign in ↗'}
          </button>

          <p
            style={{
              margin: 0,
              fontSize: '0.78rem',
              color: '#5b6784',
              textAlign: 'center',
            }}
          >
            Invited by your school? Check your inbox for an activation link.
          </p>
        </form>

        {/* Crew roster / test accounts */}
        <section
          aria-label="Demo accounts"
          style={{
            border: '1px dashed #1f2940',
            borderRadius: 12,
            padding: '1rem 1.1rem',
            background:
              'repeating-linear-gradient(135deg, transparent 0 6px, rgba(56, 189, 248, 0.02) 6px 12px)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              marginBottom: '0.6rem',
            }}
          >
            <span
              className={mono.className}
              style={{
                fontSize: '0.68rem',
                letterSpacing: '0.28em',
                color: '#7a869a',
                textTransform: 'uppercase',
              }}
            >
              Crew roster · demo
            </span>
            <span
              className={mono.className}
              style={{
                fontSize: '0.68rem',
                letterSpacing: '0.2em',
                color: '#7a869a',
              }}
            >
              pw: <span style={{ color: '#fbbf24' }}>demo</span>
            </span>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '0.4rem',
            }}
          >
            {TEST_ACCOUNTS.map((u) => (
              <button
                key={u.role}
                type="button"
                onClick={() => {
                  setEmail(u.email);
                  setPassword('demo');
                }}
                className={mono.className}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.5rem 0.65rem',
                  background: 'rgba(18, 24, 38, 0.6)',
                  border: `1px solid ${u.hue}33`,
                  borderLeft: `3px solid ${u.hue}`,
                  borderRadius: 6,
                  color: '#cbd5e1',
                  fontSize: '0.72rem',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'background 0.15s ease, transform 0.08s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = `${u.hue}14`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(18, 24, 38, 0.6)';
                }}
              >
                <span
                  style={{
                    padding: '0.1rem 0.4rem',
                    background: `${u.hue}22`,
                    color: u.hue,
                    borderRadius: 3,
                    fontSize: '0.62rem',
                    fontWeight: 700,
                    letterSpacing: '0.1em',
                    minWidth: 32,
                    textAlign: 'center',
                  }}
                >
                  {u.callsign}
                </span>
                <span
                  style={{
                    color: '#e8ecf5',
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {u.email}
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* Footer — instrument readout */}
        <footer
          className={mono.className}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: '0.65rem',
            letterSpacing: '0.2em',
            color: '#3b4660',
            textTransform: 'uppercase',
          }}
        >
          <span>FAR 61 · rev 2026</span>
          <span>TFS · KICT</span>
        </footer>
      </div>
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.7rem 0.85rem',
  background: '#0a0e1a',
  color: '#f7f9fc',
  border: '1px solid #1f2940',
  borderRadius: 6,
  fontSize: '0.92rem',
  boxSizing: 'border-box',
  transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
  outline: 'none',
  fontFamily: 'inherit',
};

function Field({
  label,
  monoClass,
  input,
  rightSlot,
}: {
  label: string;
  monoClass: string;
  input: React.ReactElement;
  rightSlot?: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
        }}
      >
        <label
          className={monoClass}
          style={{
            fontSize: '0.68rem',
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            color: '#7a869a',
          }}
        >
          {label}
        </label>
        {rightSlot}
      </div>
      {input}
    </div>
  );
}
