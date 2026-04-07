'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

/**
 * Two modes:
 *  - No session: render the "enter your email" form and call
 *    resetPasswordForEmail.
 *  - Session present (arrived back via email link): render the
 *    "set new password" form and call updateUser.
 */
export default function ResetPasswordPage() {
  const router = useRouter();
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    supabase.auth.getSession().then(({ data }) => {
      setHasSession(!!data.session);
    });
  }, []);

  async function requestReset(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const supabase = createSupabaseBrowserClient();
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin;
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${siteUrl}/reset-password`,
    });
    if (err) setError(err.message);
    else setMessage('Check your email for a reset link.');
  }

  async function setNewPassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const supabase = createSupabaseBrowserClient();
    const { error: err } = await supabase.auth.updateUser({ password });
    if (err) {
      setError(err.message);
      return;
    }
    router.push('/login');
  }

  if (hasSession === null) return <p>Loading…</p>;

  return (
    <div>
      <h1>Reset password</h1>
      {hasSession ? (
        <form onSubmit={setNewPassword}>
          <label>
            New password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </label>
          {error ? <p role="alert">{error}</p> : null}
          <button type="submit">Set password</button>
        </form>
      ) : (
        <form onSubmit={requestReset}>
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
          {error ? <p role="alert">{error}</p> : null}
          {message ? <p>{message}</p> : null}
          <button type="submit">Send reset link</button>
        </form>
      )}
    </div>
  );
}
