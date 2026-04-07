'use server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const ALLOWED = ['student', 'instructor', 'mechanic', 'admin'] as const;
type Role = (typeof ALLOWED)[number];

function isRole(x: unknown): x is Role {
  return typeof x === 'string' && (ALLOWED as readonly string[]).includes(x);
}

/**
 * Switches the active role cookie after validating against the JWT's
 * roles[] claim (defense-in-depth — the UI dropdown is cosmetic).
 */
export async function switchRole(formData: FormData) {
  const raw = formData.get('role');
  if (!isRole(raw)) throw new Error('Invalid role');
  const role: Role = raw;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const jwt = session?.access_token;
  if (!jwt) throw new Error('No access token');

  const parts = jwt.split('.');
  if (parts.length < 2) throw new Error('Malformed JWT');
  const payload = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf8')) as {
    roles?: unknown;
  };
  if (!Array.isArray(payload.roles) || !payload.roles.includes(role)) {
    throw new Error('User does not hold that role');
  }

  const cookieStore = await cookies();
  cookieStore.set('part61.active_role', role, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  });
  redirect('/');
}
