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
    pathname.startsWith('/api/') ||
    pathname.startsWith('/gate');

  if (!user && !isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // Seed or validate the part61.active_role cookie. The custom access token
  // hook stamps the user's default role into the JWT as `active_role`; we
  // copy it into a cookie so the (app) and /admin server layouts can read
  // it synchronously without an extra JWT decode.
  //
  // Phase 8 fix: also validate when the cookie IS present — if the user
  // changed (different browser session logged in), the stale cookie from
  // the previous user may reference a role the current user doesn't hold.
  // We detect this by comparing the cookie's role against the JWT's roles[]
  // claim and reset if the cookie role isn't in the user's role set.
  const existingRoleCookie = request.cookies.get('part61.active_role')?.value;
  const needsRoleSeed = user && !isAuthRoute && !existingRoleCookie;
  const needsRoleValidation = user && !isAuthRoute && existingRoleCookie;
  if (needsRoleSeed || needsRoleValidation) {
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
    // If the cookie already exists, validate it against the JWT's roles[].
    // If the current user doesn't hold the cookie's role, reset to the
    // JWT's active_role (fixes stale cookie from a different user's session).
    let finalRole = resolvedRole;
    if (existingRoleCookie && session?.access_token) {
      try {
        const payload = session.access_token.split('.')[1];
        if (payload) {
          const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4);
          const decoded = JSON.parse(Buffer.from(padded, 'base64url').toString('utf-8')) as {
            roles?: string[];
          };
          const userRoles = decoded.roles ?? [];
          if (userRoles.length > 0 && !userRoles.includes(existingRoleCookie)) {
            // Cookie role is invalid for this user — reset to JWT default
            finalRole = resolvedRole ?? userRoles[0];
          } else {
            // Cookie is valid — don't overwrite it
            finalRole = undefined;
          }
        }
      } catch {
        // ignore — keep existing cookie
        finalRole = undefined;
      }
    }

    if (finalRole) {
      const cookieOpts = {
        httpOnly: true,
        sameSite: 'lax' as const,
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 60 * 60 * 24 * 30,
      };
      request.cookies.set('part61.active_role', finalRole);
      supabaseResponse.cookies.set('part61.active_role', finalRole, cookieOpts);
    }
  }

  // Phase 8 (MSG-03): upsert user_session_activity at most once per 60s
  // per user. Uses a cookie-based throttle so we don't touch the DB on
  // every request. Failures are swallowed — this must NOT break auth.
  if (user && !isAuthRoute) {
    try {
      const lastUpsertStr = request.cookies.get('part61.session_activity_ts')?.value;
      const nowMs = Date.now();
      const sixtySecsAgo = nowMs - 60_000;
      const lastUpsert = lastUpsertStr ? Number(lastUpsertStr) : 0;
      if (!lastUpsert || lastUpsert < sixtySecsAgo) {
        // Read JWT claims to resolve school_id. Supabase-js doesn't
        // expose a synchronous decode, so we parse the access token
        // payload ourselves — same pattern as the role seed above.
        const {
          data: { session },
        } = await supabase.auth.getSession();
        let schoolId: string | undefined;
        let activeRole: string | undefined;
        if (session?.access_token) {
          try {
            const payload = session.access_token.split('.')[1];
            if (payload) {
              const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4);
              const decoded = JSON.parse(Buffer.from(padded, 'base64url').toString('utf-8')) as {
                school_id?: string;
                active_role?: string;
              };
              schoolId = decoded.school_id;
              activeRole = decoded.active_role;
            }
          } catch {
            // fall through
          }
        }
        if (schoolId) {
          const activeBaseId = request.cookies.get('part61.active_base_id')?.value;
          const xff = request.headers.get('x-forwarded-for');
          const lastSeenIp = xff?.split(',')[0]?.trim() ?? null;
          const lastSeenUserAgent = request.headers.get('user-agent');
          // supabase-js upsert honors RLS; policy
          // `user_session_activity_upsert_self` requires user_id = auth.uid().
          await supabase.from('user_session_activity').upsert({
            user_id: user.id,
            school_id: schoolId,
            last_seen_at: new Date().toISOString(),
            last_seen_ip: lastSeenIp,
            last_seen_user_agent: lastSeenUserAgent,
            active_role: activeRole ?? null,
            active_base_id: activeBaseId ?? null,
          });
        }
        // Always stamp the throttle cookie so we don't retry the lookup
        // until the TTL elapses (even if the upsert no-oped because
        // school_id wasn't resolvable).
        const tsValue = String(nowMs);
        request.cookies.set('part61.session_activity_ts', tsValue);
        supabaseResponse.cookies.set('part61.session_activity_ts', tsValue, {
          httpOnly: true,
          sameSite: 'lax' as const,
          secure: process.env.NODE_ENV === 'production',
          path: '/',
          maxAge: 300,
        });
      }
    } catch {
      // Session-activity upsert failures must NOT break auth. Log &
      // continue silently — an error here is a UX nuisance at worst.
    }
  }

  return supabaseResponse;
}
