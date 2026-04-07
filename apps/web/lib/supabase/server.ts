/**
 * Server-side Supabase client factory.
 *
 * Uses @supabase/ssr's new cookies API (getAll/setAll) — the old
 * get/set/remove triple is deprecated as of @supabase/ssr 0.5+.
 *
 * The try/catch around setAll is intentional: when this client is
 * built inside a React Server Component render (as opposed to a
 * Route Handler or Server Action), cookies() is read-only and set()
 * throws. Middleware is responsible for refreshing cookies on every
 * request, so it's safe to swallow the error here.
 */
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Server Component context — middleware handles refresh.
          }
        },
      },
    },
  );
}
