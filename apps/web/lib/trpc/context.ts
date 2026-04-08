/**
 * createContext — builds the tRPC Context from an incoming request.
 *
 * Steps:
 *   1. Build a Supabase SSR client (with the request's cookies).
 *   2. Call supabase.auth.getUser() — this verifies the JWT against
 *      Supabase. No user → public context with session: null.
 *   3. Load the public.users row for school_id + email.
 *   4. Load user_roles[] for the user.
 *   5. Read the part61.active_role cookie. Validate it's in roles[].
 *      Fall back to the JWT active_role claim, then to the
 *      is_default row.
 *   6. Return { session, supabase, rawJwt }.
 *
 * Done outside tRPC's middleware chain so that the session is already
 * resolved and verified before any procedure runs. The tenant
 * middleware (`withTenantTx`) then opens a db transaction and calls
 * SET LOCAL for defense-in-depth.
 */
import { cookies } from 'next/headers';
import { and, eq } from 'drizzle-orm';
import { db, users, userRoles, userBase } from '@part61/db';
import type { TRPCContext, Session, Role } from '@part61/api';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const ROLES: readonly Role[] = ['student', 'instructor', 'mechanic', 'admin'];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isRole(x: unknown): x is Role {
  return typeof x === 'string' && (ROLES as readonly string[]).includes(x);
}

function isUuid(x: unknown): x is string {
  return typeof x === 'string' && UUID_RE.test(x);
}

export async function createContext(): Promise<TRPCContext> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { session: null, supabase };
  }

  // Load the public.users shadow row.
  const userRow = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  const shadow = userRow[0];
  if (!shadow) {
    // Auth user exists but no shadow row yet (e.g. still in the
    // invite-accept flow before Task 2 of invite). Treat as public.
    return { session: null, supabase };
  }

  // Load all roles for this user.
  const roleRows = await db.select().from(userRoles).where(eq(userRoles.userId, user.id));
  const rolesList: Role[] = roleRows.map((r) => r.role as Role).filter(isRole);
  if (rolesList.length === 0) {
    return { session: null, supabase };
  }

  // Resolve active role: cookie > JWT claim > is_default.
  const cookieStore = await cookies();
  const cookieRole = cookieStore.get('part61.active_role')?.value;
  const jwtClaims = (user.app_metadata ?? {}) as Record<string, unknown>;
  const jwtActive = jwtClaims['active_role'];

  let activeRole: Role | undefined;
  if (isRole(cookieRole) && rolesList.includes(cookieRole)) {
    activeRole = cookieRole;
  } else if (isRole(jwtActive) && rolesList.includes(jwtActive)) {
    activeRole = jwtActive;
  } else {
    const def = roleRows.find((r) => r.isDefault)?.role;
    if (isRole(def)) activeRole = def;
  }
  if (!activeRole) activeRole = rolesList[0]!;

  // Resolve active base id from cookie; validate it's a well-formed
  // uuid AND that a user_base row exists for this user + base. Falls
  // back to the user's first user_base row when the cookie is missing
  // or invalid. May still be null if the user has no user_base rows
  // at all (e.g. an admin with no per-base assignment yet) — in that
  // case `withTenantTx` skips setting app.base_id and base-scoped RLS
  // policies fall through their `is null` branch.
  const cookieBaseRaw = cookieStore.get('part61.active_base_id')?.value;
  let activeBaseId: string | null = null;
  if (isUuid(cookieBaseRaw)) {
    const match = await db
      .select({ baseId: userBase.baseId })
      .from(userBase)
      .where(
        and(eq(userBase.userId, user.id), eq(userBase.baseId, cookieBaseRaw)),
      )
      .limit(1);
    if (match[0]) activeBaseId = match[0].baseId;
  }
  if (!activeBaseId) {
    const first = await db
      .select({ baseId: userBase.baseId })
      .from(userBase)
      .where(eq(userBase.userId, user.id))
      .limit(1);
    if (first[0]) activeBaseId = first[0].baseId;
  }

  const session: Session = {
    userId: user.id,
    schoolId: shadow.schoolId,
    email: shadow.email,
    roles: rolesList,
    activeRole,
    activeBaseId,
  };

  const {
    data: { session: authSession },
  } = await supabase.auth.getSession();

  return {
    session,
    supabase,
    rawJwt: authSession?.access_token,
  };
}
