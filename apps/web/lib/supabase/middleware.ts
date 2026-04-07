/**
 * updateSession — the per-request cookie refresh helper called from
 * apps/web/middleware.ts. Mirrors the canonical pattern in the
 * Supabase Next.js SSR docs: build a server client with the incoming
 * cookies, call supabase.auth.getUser() to trigger a token refresh
 * if needed, then mirror any updated cookies back onto the outgoing
 * NextResponse.
 *
 * MUST NOT run any logic between createServerClient() and getUser()
 * — per the Supabase docs, doing so can cause the session to be
 * silently dropped.
 */
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: do not run code between createServerClient and getUser.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isAuthRoute =
    pathname.startsWith('/login') ||
    pathname.startsWith('/reset-password') ||
    pathname.startsWith('/invite') ||
    pathname.startsWith('/verify') ||
    pathname.startsWith('/auth/callback') ||
    pathname.startsWith('/api/');

  if (!user && !isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
