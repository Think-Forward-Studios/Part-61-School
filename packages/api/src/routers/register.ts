/**
 * register router — PER-02 public self-registration endpoint.
 *
 * This is a publicProcedure (no auth) that lets a prospective student
 * or rental customer submit their bio. We do NOT create an auth.users
 * row here; that happens when an admin approves the registration.
 *
 * Because publicProcedure runs without a Session, it can't go through
 * withTenantTx (which requires ctx.session) — the insert would hit
 * RLS with no school_id claim. The router instead calls the SECURITY
 * DEFINER SQL function public.submit_registration(...) which performs
 * the insert inside a trusted context.
 */
import { TRPCError } from '@trpc/server';
import { sql } from 'drizzle-orm';
import { db } from '@part61/db';
import { registerSubmitInput } from '@part61/domain';
import { router } from '../trpc';
import { publicProcedure } from '../procedures';

export const registerRouter = router({
  submit: publicProcedure
    .input(registerSubmitInput)
    .mutation(async ({ input }) => {
      try {
        const result = (await db.execute(sql`
          select public.submit_registration(
            ${input.schoolId}::uuid,
            ${input.email}::text,
            ${input.firstName}::text,
            ${input.lastName}::text,
            ${input.phone ?? null}::text,
            ${input.requestedRole}::public.role
          ) as user_id
        `)) as unknown;
        // drizzle-orm/postgres-js returns the raw postgres-js result
        // array; normalise both array and {rows} shapes defensively.
        const rows = Array.isArray(result)
          ? (result as Array<{ user_id?: string; submit_registration?: string }>)
          : ((result as { rows?: Array<{ user_id?: string }> }).rows ?? []);
        const first = rows[0] ?? {};
        const userId =
          (first as { user_id?: string }).user_id ??
          (first as { submit_registration?: string }).submit_registration ??
          null;
        return { ok: true, userId };
      } catch (e) {
        const message =
          e instanceof Error ? e.message : 'Registration submission failed';
        throw new TRPCError({ code: 'BAD_REQUEST', message });
      }
    }),
});
