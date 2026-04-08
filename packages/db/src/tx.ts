import { sql } from 'drizzle-orm';

/**
 * withSchoolContext — defense-in-depth tenant context for a transaction.
 *
 * Sets the `app.school_id`, `app.user_id`, and `app.active_role` GUCs
 * via `set_config(..., true)` (the function form of `SET LOCAL`, which
 * accepts bound parameters — raw `SET LOCAL` does not). These GUCs are
 * read by:
 *   - audit.fn_log_change() to populate audit_log columns
 *   - any RLS policy that prefers `current_setting('app.school_id')`
 *     over `auth.jwt() ->> 'school_id'` (Phase 1 policies use the
 *     JWT path; the GUC path is available as a fallback)
 *
 * The third argument to set_config is `is_local = true`, scoping the
 * change to the current transaction. With Supabase's transaction-mode
 * pooler this is essential — session-scoped settings would leak
 * between requests.
 */
export interface SchoolContext {
  schoolId: string;
  userId: string;
  activeRole:
    | 'student'
    | 'instructor'
    | 'mechanic'
    | 'admin'
    | 'rental_customer';
  /**
   * Optional active base. When set, `withSchoolContext` also configures
   * the `app.base_id` GUC so base-scoped RLS policies can read it via
   * `current_setting('app.base_id', true)`. When unset, the GUC is not
   * touched and `current_setting(..., true)` returns NULL — base-scoped
   * policies include an `is null` branch for this case (Phase 1 flows
   * that don't yet have a base context).
   */
  baseId?: string | null;
}

// Minimal structural type so this module doesn't need to import a
// concrete PgTransaction class (Drizzle's transaction type changes
// across versions and we want this helper to work with both the
// top-level `db` and a transaction handle).
export interface ExecutorLike {
  execute: (query: ReturnType<typeof sql>) => Promise<unknown>;
}

export async function withSchoolContext<T>(
  tx: ExecutorLike,
  ctx: SchoolContext,
  fn: () => Promise<T>,
): Promise<T> {
  await tx.execute(
    sql`select set_config('app.school_id', ${ctx.schoolId}, true)`,
  );
  await tx.execute(
    sql`select set_config('app.user_id', ${ctx.userId}, true)`,
  );
  await tx.execute(
    sql`select set_config('app.active_role', ${ctx.activeRole}, true)`,
  );
  if (ctx.baseId) {
    await tx.execute(
      sql`select set_config('app.base_id', ${ctx.baseId}, true)`,
    );
  }
  return fn();
}
