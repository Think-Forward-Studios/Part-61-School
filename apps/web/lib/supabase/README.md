# Supabase wiring (apps/web)

## Active-role strategy

The authenticated user's **active role** is stored in a signed,
HTTP-only cookie named `part61.active_role`. It is **not** a JWT claim.

### Why not the JWT?

Switching roles via a JWT custom claim would require a full token
refresh round-trip on every switch (Supabase's
`supabase.auth.refreshSession()`). Round-trips on every click break the
UX. Instead:

1. The custom_access_token_hook stamps a **default** `active_role` into
   the JWT (equal to the user's `is_default=true` row in `user_roles`).
2. At runtime, server code reads `part61.active_role` first and falls
   back to the JWT's `active_role` claim.
3. The selected role is validated against the JWT's `roles[]` array
   before being passed to tRPC's tenant middleware, which in turn
   calls `SET LOCAL app.active_role = ?` for defense-in-depth.

RLS policies that need to enforce a per-role rule should read
`current_setting('app.active_role')`, NOT the JWT.

Reference: phase research §Pattern 2 option 1 (cookie + SET LOCAL).

## Cookie attributes

| attr     | value                       |
| -------- | --------------------------- |
| name     | `part61.active_role`        |
| httpOnly | true                        |
| sameSite | `lax`                       |
| secure   | true in production          |
| path     | `/`                         |
| max-age  | session (cleared on logout) |

## Files

- `server.ts` — `createSupabaseServerClient()` for Server Components,
  Route Handlers, Server Actions. Uses `next/headers::cookies()`.
- `client.ts` — `createSupabaseBrowserClient()` for Client Components.
- `middleware.ts` — `updateSession()` cookie-refresh helper called
  from `apps/web/middleware.ts`.
