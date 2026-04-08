'use server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { db, userBase } from '@part61/db';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Writes the part61.active_base_id cookie after verifying the caller
 * actually has a user_base row for that base. Redirects back to the
 * referring path (or / if missing).
 */
export async function switchBase(formData: FormData) {
  const raw = formData.get('baseId');
  if (typeof raw !== 'string' || !UUID_RE.test(raw)) {
    throw new Error('Invalid base id');
  }
  const returnTo = (formData.get('returnTo') as string | null) ?? '/';

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');

  const match = await db
    .select({ baseId: userBase.baseId })
    .from(userBase)
    .where(and(eq(userBase.userId, user.id), eq(userBase.baseId, raw)))
    .limit(1);
  if (!match[0]) throw new Error('User does not have access to that base');

  const cookieStore = await cookies();
  cookieStore.set('part61.active_base_id', raw, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  });
  redirect(returnTo);
}
