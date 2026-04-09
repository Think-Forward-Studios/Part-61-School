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

  // Seed the part61.active_role cookie on first authenticated request of a
  // session. The custom access token hook stamps the user's default role
  // into the JWT as `active_role`; we copy it into a cookie so the (app)
  // and /admin server layouts can read it synchronously without an extra
  // JWT decode. Only set it if missing — user may have explicitly switched
  // roles via /switch-role, which owns the cookie after that.
  if (user && !isAuthRoute && !request.cookies.get('part61.active_role')) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const jwtActiveRole = (session?.user?.app_metadata as { active_role?: string } | undefined)
      ?.active_role;
    // Fallback: decode the access_token ourselves if app_metadata doesn't
    // carry the claim (our hook sets it at the top level of the JWT, not
    // inside app_metadata).
    let resolvedRole = jwtActiveRole;
    if (!resolvedRole && session?.access_token) {
      try {
        const payload = session.access_token.split('.')[1];
        if (payload) {
          const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4);
          const decoded = JSON.parse(Buffer.from(padded, 'base64url').toString('utf-8')) as {
            active_role?: string;
          };
          resolvedRole = decoded.active_role;
        }
      } catch {
        // ignore — fall through to layout fallback
      }
    }
    if (resolvedRole) {
      const cookieOpts = {
        httpOnly: true,
        sameSite: 'lax' as const,
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 60 * 60 * 24 * 30,
      };
      request.cookies.set('part61.active_role', resolvedRole);
      supabaseResponse.cookies.set('part61.active_role', resolvedRole, cookieOpts);
    }
  }

  return supabaseResponse;
}
