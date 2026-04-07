'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

/**
 * Invited users land here after clicking the link in their invitation
 * email. The Supabase invite flow already exchanged the token for a
 * session, so we just need to let them set a password.
 */
export default function InviteAcceptPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const supabase = createSupabaseBrowserClient();
    const { error: err } = await supabase.auth.updateUser({ password });
    if (err) {
      setError(err.message);
      return;
    }
    router.push('/');
    router.refresh();
  }

  return (
    <div>
      <h1>Welcome</h1>
      <p>Set a password to finish activating your account.</p>
      <form onSubmit={onSubmit}>
        <label>
          Password
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
    </div>
  );
}
