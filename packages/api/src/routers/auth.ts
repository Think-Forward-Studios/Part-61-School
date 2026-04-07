/**
 * auth router — admin invite, active-role switch, and me.
 *
 * inviteUser (adminProcedure):
 *   Calls supabase.auth.admin.inviteUserByEmail with redirectTo set to
 *   {NEXT_PUBLIC_SITE_URL}/invite/accept and embeds invited_role +
 *   invited_school_id in the user_metadata. On success, inserts a row
 *   into public.users (id mirrors auth.users.id) and a user_roles row
 *   with is_default=true. Both inserts go through ctx.tx so the audit
 *   trigger fires with the admin's actor_user_id / actor_role.
 *
 * switchRole (protectedProcedure):
 *   Validates role is in ctx.session.roles and returns the new role.
 *   The signed cookie mutation happens in the web layer (cookies()
 *   is a Next.js server API, not safe to call from @part61/api). The
 *   client calls this procedure to validate, then a Next.js server
 *   action writes the cookie.
 *
 * me: returns ctx.session.
 *
 * Pitfall 2: SUPABASE_SERVICE_ROLE_KEY is read ONLY inside inviteUser,
 * never at module top level. CI grep gate enforces this.
 */
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { sql } from 'drizzle-orm';
import { router } from '../trpc';
import { protectedProcedure, adminProcedure } from '../procedures';

const roleEnum = z.enum(['student', 'instructor', 'mechanic', 'admin']);

const inviteInput = z.object({
  email: z.string().email(),
  role: roleEnum,
});

const switchRoleInput = z.object({
  role: roleEnum,
});

export const authRouter = router({
  inviteUser: adminProcedure.input(inviteInput).mutation(async ({ ctx, input }) => {
    // Lazy import + lazy env read — never at module load so unit
    // tests can import this file without env vars present.
    const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
    if (!url || !serviceKey) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Supabase admin credentials are not configured',
      });
    }
    // Lazy import to avoid pulling supabase-js into non-invite code paths.
    const { createClient } = await import('@supabase/supabase-js');
    const admin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data, error } = await admin.auth.admin.inviteUserByEmail(input.email, {
      redirectTo: `${siteUrl}/invite/accept`,
      data: {
        invited_role: input.role,
        invited_school_id: ctx.session!.schoolId,
      },
    });
    if (error || !data.user) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: error?.message ?? 'Invite failed',
      });
    }

    const newUserId = data.user.id;
    const tx = ctx.tx as {
      execute: (q: ReturnType<typeof sql>) => Promise<unknown>;
    };

    // Insert the public.users shadow row. The audit trigger will stamp
    // actor_user_id from app.user_id (set by withTenantTx).
    await tx.execute(sql`
        insert into public.users (id, school_id, email)
        values (${newUserId}, ${ctx.session!.schoolId}, ${input.email})
      `);
    await tx.execute(sql`
        insert into public.user_roles (user_id, role, is_default)
        values (${newUserId}, ${input.role}, true)
      `);

    return { userId: newUserId, email: input.email, role: input.role };
  }),

  switchRole: protectedProcedure.input(switchRoleInput).mutation(({ ctx, input }) => {
    if (!ctx.session!.roles.includes(input.role)) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'User does not hold that role',
      });
    }
    return { activeRole: input.role };
  }),

  me: protectedProcedure.query(({ ctx }) => ctx.session!),
});
