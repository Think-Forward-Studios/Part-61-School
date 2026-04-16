'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

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
    <div>
      <h1>Part 61 School</h1>
      <h2>Sign in</h2>
      <form onSubmit={onSubmit}>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
        </label>
        {error ? <p role="alert">{error}</p> : null}
        <button type="submit" disabled={loading}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <p>
        <Link href="/reset-password">Forgot password?</Link>
      </p>
      <p>Invited? Check your email for an activation link.</p>

      <div
        style={{
          marginTop: '2rem',
          padding: '1rem',
          border: '1px solid #333',
          borderRadius: 8,
          fontSize: '0.85rem',
          color: '#999',
        }}
      >
        <strong style={{ color: '#ccc' }}>Test accounts</strong> (password: <code>demo</code>)
        <table style={{ width: '100%', marginTop: '0.5rem', borderCollapse: 'collapse' }}>
          <tbody>
            {[
              { role: 'Admin', email: 'admin@tfs.test' },
              { role: 'Instructor', email: 'instructor@tfs.test' },
              { role: 'Student', email: 'student@tfs.test' },
              { role: 'Mechanic', email: 'mechanic@tfs.test' },
            ].map((u) => (
              <tr key={u.role}>
                <td style={{ padding: '0.25rem 0' }}>{u.role}</td>
                <td style={{ padding: '0.25rem 0' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setEmail(u.email);
                      setPassword('demo');
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#6b9fff',
                      cursor: 'pointer',
                      padding: 0,
                      textDecoration: 'underline',
                      fontSize: '0.85rem',
                    }}
                  >
                    {u.email}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
