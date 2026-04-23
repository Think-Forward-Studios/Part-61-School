/**
 * admin/people router — ADM-01/02/03/04, PER-02.
 *
 * Every procedure gates on adminProcedure (role=admin) and runs inside
 * withTenantTx so school_id / user_id / active_role GUCs are set
 * before any query. RLS is defense in depth.
 *
 * approveRegistration is the one procedure that must touch
 * supabase.auth.admin — it creates the auth.users row with a
 * pre-assigned id equal to the already-existing public.users row so
 * the two stay in sync (Research Open Question 1 resolved YES:
 * supabase-js AdminUserAttributes.id is string | undefined).
 */
import { TRPCError } from '@trpc/server';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { personProfile, users, userRoles, personHold } from '@part61/db';
import {
  createPersonInput,
  updatePersonInput,
  userIdInput,
  listPeopleInput,
  assignRoleInput,
  removeRoleInput,
  rejectRegistrationInput,
  setUserStatusInput,
} from '@part61/domain';
import { router } from '../../trpc';
import { adminProcedure } from '../../procedures';

type Tx = {
  insert: typeof import('@part61/db').db.insert;
  select: typeof import('@part61/db').db.select;
  update: typeof import('@part61/db').db.update;
  delete: (typeof import('@part61/db').db)['delete'];
  execute: (q: ReturnType<typeof sql>) => Promise<unknown>;
};

export const adminPeopleRouter = router({
  /**
   * List people with aggregated roles + active hold count. Filters by
   * role (joins user_roles) and status.
   */
  list: adminProcedure.input(listPeopleInput).query(async ({ ctx, input }) => {
    const tx = ctx.tx as Tx;
    const schoolId = ctx.session!.schoolId;
    const roleFilter = input.role
      ? sql`and exists (
            select 1 from public.user_roles ur
            where ur.user_id = u.id and ur.role = ${input.role}::public.role
          )`
      : sql``;
    const statusFilter = input.status
      ? sql`and u.status = ${input.status}::public.user_status`
      : sql``;
    const rows = (await tx.execute(sql`
      select
        u.id,
        u.email,
        u.full_name,
        u.status,
        u.created_at,
        u.deleted_at,
        pp.first_name,
        pp.last_name,
        pp.phone,
        coalesce(
          (select array_agg(ur.role::text)
             from public.user_roles ur
             where ur.user_id = u.id),
          '{}'::text[]
        ) as roles,
        (select count(*)::int
           from public.person_hold ph
           where ph.user_id = u.id and ph.cleared_at is null) as active_hold_count
      from public.users u
      left join public.person_profile pp on pp.user_id = u.id
      where u.school_id = ${schoolId}
        and u.deleted_at is null
        ${roleFilter}
        ${statusFilter}
      order by coalesce(pp.last_name, u.email)
      limit ${input.limit}
      offset ${input.offset}
    `)) as unknown as Array<Record<string, unknown>>;

    const totalRows = (await tx.execute(sql`
      select count(*)::int as total
      from public.users u
      where u.school_id = ${schoolId}
        and u.deleted_at is null
        ${roleFilter}
        ${statusFilter}
    `)) as unknown as Array<{ total: number }>;

    return { rows, total: totalRows[0]?.total ?? 0 };
  }),

  getById: adminProcedure.input(userIdInput).query(async ({ ctx, input }) => {
    const tx = ctx.tx as Tx;
    const rows = await tx
      .select()
      .from(users)
      .where(and(eq(users.id, input.userId), eq(users.schoolId, ctx.session!.schoolId)))
      .limit(1);
    const user = rows[0];
    if (!user) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
    }
    const profileRows = await tx
      .select()
      .from(personProfile)
      .where(eq(personProfile.userId, input.userId))
      .limit(1);
    const roleRows = await tx.select().from(userRoles).where(eq(userRoles.userId, input.userId));
    return { user, profile: profileRows[0] ?? null, roles: roleRows };
  }),

  listPending: adminProcedure.query(async ({ ctx }) => {
    const tx = ctx.tx as Tx;
    const rows = (await tx.execute(sql`
      select u.id, u.email, u.created_at, pp.first_name, pp.last_name, pp.phone
      from public.users u
      left join public.person_profile pp on pp.user_id = u.id
      where u.school_id = ${ctx.session!.schoolId}
        and u.status = 'pending'
        and u.deleted_at is null
      order by u.created_at asc
    `)) as unknown as Array<Record<string, unknown>>;
    return rows;
  }),

  create: adminProcedure.input(createPersonInput).mutation(async ({ ctx, input }) => {
    const tx = ctx.tx as Tx;
    const schoolId = ctx.session!.schoolId;
    // Generate a new uuid for this admin-created user. Because admins
    // skip the self-registration queue entirely, we create the auth
    // user right away so the email invite lands immediately.
    // Delegation: mirror auth.inviteUser — this admin.people.create
    // path is the explicit "create + invite" flow.
    const newId = crypto.randomUUID();

    // Use the supabase service role client lazily.
    const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
    if (!url || !serviceKey) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Supabase admin credentials are not configured',
      });
    }
    if (!siteUrl) {
      // Fail loud instead of emailing a broken localhost link.
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message:
          'NEXT_PUBLIC_SITE_URL is not set. The invite link would point to localhost. Set it in Vercel before retrying.',
      });
    }
    const { createClient } = await import('@supabase/supabase-js');
    const admin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data, error } = await admin.auth.admin.inviteUserByEmail(input.email, {
      redirectTo: `${siteUrl}/invite/accept`,
      data: {
        invited_role: input.role,
        invited_school_id: schoolId,
        user_id: newId,
      },
    });
    if (error || !data.user) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: error?.message ?? 'Invite failed',
      });
    }
    const authUserId = data.user.id;

    await tx.execute(sql`
        insert into public.users (id, school_id, email, full_name, status)
        values (
          ${authUserId},
          ${schoolId},
          ${input.email},
          ${`${input.firstName} ${input.lastName}`},
          'active'
        )
      `);
    await tx.execute(sql`
        insert into public.user_roles (user_id, role, mechanic_authority, is_default)
        values (
          ${authUserId},
          ${input.role}::public.role,
          ${input.mechanicAuthority ?? 'none'}::public.mechanic_authority,
          true
        )
      `);
    await tx.execute(sql`
        insert into public.person_profile (
          user_id, school_id, first_name, last_name, date_of_birth,
          address_line1, address_line2, city, state, postal_code, country,
          phone, email_alt, faa_airman_cert_number, citizenship_status,
          tsa_afsp_status, notes
        ) values (
          ${authUserId},
          ${schoolId},
          ${input.firstName},
          ${input.lastName},
          ${input.dateOfBirth ?? null},
          ${input.addressLine1 ?? null},
          ${input.addressLine2 ?? null},
          ${input.city ?? null},
          ${input.state ?? null},
          ${input.postalCode ?? null},
          ${input.country ?? null},
          ${input.phone ?? null},
          ${input.emailAlt ?? null},
          ${input.faaAirmanCertNumber ?? null},
          ${(input.citizenshipStatus ?? null) as string | null},
          ${(input.tsaAfspStatus ?? null) as string | null},
          ${input.notes ?? null}
        )
      `);
    return { userId: authUserId };
  }),

  update: adminProcedure.input(updatePersonInput).mutation(async ({ ctx, input }) => {
    const tx = ctx.tx as Tx;
    // Only update fields that were provided. Using raw SQL with COALESCE
    // would be cleaner for sparse updates; here we do two narrowly
    // scoped updates (users.email, person_profile fields).
    if (input.email !== undefined) {
      await tx
        .update(users)
        .set({ email: input.email })
        .where(and(eq(users.id, input.userId), eq(users.schoolId, ctx.session!.schoolId)));
    }
    // Upsert person_profile fields. citizenshipStatus / tsaAfspStatus
    // are admin-managed legal-status fields (PER-01); only this
    // endpoint can set them — see me.updateProfile which
    // deliberately does NOT accept them.
    await tx.execute(sql`
        update public.person_profile
           set first_name         = coalesce(${input.firstName ?? null}::text, first_name),
               last_name          = coalesce(${input.lastName ?? null}::text,  last_name),
               phone              = coalesce(${input.phone ?? null}::text,     phone),
               notes              = coalesce(${input.notes ?? null}::text,     notes),
               citizenship_status = coalesce(${(input.citizenshipStatus ?? null) as string | null}::public.citizenship_status, citizenship_status),
               tsa_afsp_status    = coalesce(${(input.tsaAfspStatus ?? null) as string | null}::public.tsa_afsp_status, tsa_afsp_status),
               updated_at         = now()
         where user_id = ${input.userId}
      `);
    return { ok: true };
  }),

  softDelete: adminProcedure.input(userIdInput).mutation(async ({ ctx, input }) => {
    const tx = ctx.tx as Tx;
    const rows = await tx
      .update(users)
      .set({ deletedAt: new Date(), status: 'inactive' })
      .where(
        and(
          eq(users.id, input.userId),
          eq(users.schoolId, ctx.session!.schoolId),
          isNull(users.deletedAt),
        ),
      )
      .returning({ id: users.id });
    if (rows.length === 0) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
    }
    return { ok: true };
  }),

  /**
   * Hard delete ("purge") — fully remove a user from this tenant and
   * release their email address so it can be re-invited. Only valid
   * when the user has ZERO downstream history. Any reference from
   * flight logs, training records, holds, enrollments, audit trail,
   * etc. will cause Postgres to raise a foreign-key violation, which
   * we catch and surface as a clear error message. That's the whole
   * safety model: soft delete for anyone who has touched the system,
   * purge only for accidental/typo accounts.
   *
   * We delete the "satellite" rows first (user_roles, user_base,
   * person_profile) so FK dependents don't block the users row, but
   * we do NOT cascade to history tables. After the DB delete succeeds,
   * we also remove the Supabase auth.users row so the email is free
   * to re-use.
   */
  purge: adminProcedure.input(userIdInput).mutation(async ({ ctx, input }) => {
    const tx = ctx.tx as Tx;
    const schoolId = ctx.session!.schoolId;

    // Confirm the user exists in this tenant.
    const target = await tx
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(and(eq(users.id, input.userId), eq(users.schoolId, schoolId)))
      .limit(1);
    if (target.length === 0) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
    }
    const email = target[0]!.email;

    // Admins cannot purge themselves — that would lock them out.
    if (input.userId === ctx.session!.userId) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'You cannot purge your own account.',
      });
    }

    try {
      // Delegate the actual cascade to admin.purge_user (migration
      // 0044). That function discovers every FK pointing at
      // public.users.id via pg_catalog at runtime, so it automatically
      // handles tables we haven't seen and any new ones a future
      // migration adds. For each FK column it either DELETES the row
      // (NOT NULL column — the row is user-owned) or SETs the column
      // to NULL (nullable "actor" pointer — preserves other users'
      // history that's merely stamped by the target).
      //
      // It iterates up to 10 passes, skipping FK-blocked tables via
      // savepoint-style exception handling so multi-level
      // dependencies clear in the right order without a hand-
      // maintained ordering list. If it still can't delete the user
      // row after 10 passes, it raises with the blocker list and the
      // transaction rolls back.
      await tx.execute(sql`
        select admin.purge_user(${input.userId}::uuid, ${schoolId}::uuid)
      `);
    } catch (err) {
      // Surface the raw DB error so the operator can see which table
      // still references the user. When we hit a 23503 FK violation
      // from a table not in the cascade above, add it and redeploy.
      const msg = err instanceof Error ? err.message : String(err);
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message:
          'Purge blocked — a related row still references this user. ' +
          'The whole transaction rolled back; no data was deleted. ' +
          msg,
      });
    }

    // DB delete succeeded. Best-effort remove the Supabase auth.users row
    // so the email frees up. If Supabase credentials aren't configured
    // we skip silently — the DB state is already consistent.
    const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (url && serviceKey) {
      try {
        const { createClient } = await import('@supabase/supabase-js');
        const admin = createClient(url, serviceKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        });
        // deleteUser is idempotent — a missing user is treated as ok.
        await admin.auth.admin.deleteUser(input.userId);
      } catch {
        // Non-fatal: operator can re-invite under a different email if
        // the auth row sticks around. Don't undo the DB delete.
      }
    }

    return { ok: true, email };
  }),

  assignRole: adminProcedure.input(assignRoleInput).mutation(async ({ ctx, input }) => {
    const tx = ctx.tx as Tx;
    // Verify the target user belongs to this school.
    const targetRows = await tx
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, input.userId), eq(users.schoolId, ctx.session!.schoolId)))
      .limit(1);
    if (targetRows.length === 0) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
    }
    await tx.execute(sql`
        insert into public.user_roles (user_id, role, mechanic_authority, is_default)
        values (
          ${input.userId},
          ${input.role}::public.role,
          ${input.mechanicAuthority ?? 'none'}::public.mechanic_authority,
          false
        )
        on conflict (user_id, role) do update
          set mechanic_authority = excluded.mechanic_authority
      `);
    return { ok: true };
  }),

  removeRole: adminProcedure.input(removeRoleInput).mutation(async ({ ctx, input }) => {
    const tx = ctx.tx as Tx;
    await tx.execute(sql`
        delete from public.user_roles ur
         using public.users u
         where ur.user_id = u.id
           and ur.user_id = ${input.userId}
           and ur.role = ${input.role}::public.role
           and u.school_id = ${ctx.session!.schoolId}
      `);
    return { ok: true };
  }),

  /**
   * Approve a pending self-registration. The public.users row already
   * exists (status='pending') and has a pre-assigned uuid. This
   * procedure calls supabase.auth.admin.createUser with that same id,
   * then flips status to 'active' and sends an invite link.
   */
  approveRegistration: adminProcedure.input(userIdInput).mutation(async ({ ctx, input }) => {
    const tx = ctx.tx as Tx;
    const schoolId = ctx.session!.schoolId;
    // Fetch the pending row.
    const rows = await tx
      .select()
      .from(users)
      .where(
        and(eq(users.id, input.userId), eq(users.schoolId, schoolId), eq(users.status, 'pending')),
      )
      .limit(1);
    const pending = rows[0];
    if (!pending) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Pending registration not found',
      });
    }
    const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
    if (!url || !serviceKey) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Supabase admin credentials are not configured',
      });
    }
    if (!siteUrl) {
      // Fail loud instead of emailing a broken localhost link.
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message:
          'NEXT_PUBLIC_SITE_URL is not set. The invite link would point to localhost. Set it in Vercel before retrying.',
      });
    }
    const { createClient } = await import('@supabase/supabase-js');
    const admin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    // Create the auth user with the pre-assigned id so auth.users.id
    // matches public.users.id (Research Open Question 1 — resolved
    // YES: supabase-js AdminUserAttributes.id is string | undefined).
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      id: input.userId,
      email: pending.email,
      email_confirm: false,
      user_metadata: {
        invited_school_id: schoolId,
        approved_by: ctx.session!.userId,
      },
    });
    if (createErr || !created.user) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: createErr?.message ?? 'Failed to create auth user',
      });
    }
    // Send the invite / set-password link.
    const { error: linkErr } = await admin.auth.admin.generateLink({
      type: 'invite',
      email: pending.email,
      options: { redirectTo: `${siteUrl}/invite/accept` },
    });
    if (linkErr) {
      // Non-fatal: the user can still use "forgot password" later.
      // We intentionally do not throw.
    }
    await tx.update(users).set({ status: 'active' }).where(eq(users.id, input.userId));
    return { ok: true, userId: input.userId };
  }),

  rejectRegistration: adminProcedure
    .input(rejectRegistrationInput)
    .mutation(async ({ ctx, input }) => {
      const tx = ctx.tx as Tx;
      const rows = await tx
        .update(users)
        .set({ status: 'rejected' })
        .where(
          and(
            eq(users.id, input.userId),
            eq(users.schoolId, ctx.session!.schoolId),
            eq(users.status, 'pending'),
          ),
        )
        .returning({ id: users.id });
      if (rows.length === 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Pending registration not found',
        });
      }
      // Append a note explaining the reason via person_profile.notes.
      await tx.execute(sql`
        update public.person_profile
           set notes = coalesce(notes || E'\n', '') || ${`REJECTED: ${input.reason}`},
               updated_at = now()
         where user_id = ${input.userId}
      `);
      return { ok: true };
    }),

  /**
   * Re-send the Supabase invite email. Useful when the original link
   * landed on a broken host (e.g. localhost during an early deploy
   * before NEXT_PUBLIC_SITE_URL was set), or when the user never got
   * the first email at all. Idempotent — each call generates a new
   * invite token and invalidates the previous one.
   */
  resendInvite: adminProcedure.input(userIdInput).mutation(async ({ ctx, input }) => {
    const tx = ctx.tx as Tx;
    const schoolId = ctx.session!.schoolId;
    const rows = await tx
      .select({ email: users.email, status: users.status })
      .from(users)
      .where(and(eq(users.id, input.userId), eq(users.schoolId, schoolId)))
      .limit(1);
    const target = rows[0];
    if (!target) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
    }
    const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
    if (!url || !serviceKey) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Supabase admin credentials are not configured',
      });
    }
    if (!siteUrl) {
      // Guard so we never silently send another broken localhost link.
      // Set NEXT_PUBLIC_SITE_URL in the Vercel project (Production env)
      // to the production host, e.g. https://<project>.vercel.app.
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message:
          'NEXT_PUBLIC_SITE_URL is not set. The invite link would point to localhost. Set it in Vercel before retrying.',
      });
    }
    const { createClient } = await import('@supabase/supabase-js');
    const admin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error } = await admin.auth.admin.inviteUserByEmail(target.email, {
      redirectTo: `${siteUrl}/invite/accept`,
      data: { invited_school_id: schoolId, resent_by: ctx.session!.userId },
    });
    if (error) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: error.message || 'Failed to resend invite',
      });
    }
    return { ok: true };
  }),

  /**
   * Email the user a password-reset link. Delegates to Supabase Auth,
   * which handles token generation, email delivery, and rate limiting.
   * The redirect lands on /reset-password which already accepts the
   * recovery flow (see apps/web/app/(auth)/reset-password/page.tsx).
   */
  sendPasswordReset: adminProcedure.input(userIdInput).mutation(async ({ ctx, input }) => {
    const tx = ctx.tx as Tx;
    const schoolId = ctx.session!.schoolId;
    const rows = await tx
      .select({ email: users.email })
      .from(users)
      .where(and(eq(users.id, input.userId), eq(users.schoolId, schoolId)))
      .limit(1);
    const target = rows[0];
    if (!target) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
    }
    const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
    if (!url || !serviceKey) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Supabase admin credentials are not configured',
      });
    }
    if (!siteUrl) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'NEXT_PUBLIC_SITE_URL is not set. Set it in Vercel before retrying.',
      });
    }
    const { createClient } = await import('@supabase/supabase-js');
    const admin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    // generateLink with type='recovery' returns a magic link + sends
    // the standard Supabase reset email. We don't need the returned
    // URL — Supabase delivers it to the user directly.
    const { error } = await admin.auth.admin.generateLink({
      type: 'recovery',
      email: target.email,
      options: { redirectTo: `${siteUrl}/reset-password` },
    });
    if (error) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: error.message || 'Failed to send password reset',
      });
    }
    return { ok: true };
  }),

  /**
   * Flip a user between 'active' and 'inactive'. Inactive users keep
   * all their history + tenant rows; they just can't act on the
   * platform. Pending/rejected stay the exclusive domain of the
   * registration flow (approve/reject) so this path can't reopen a
   * closed decision.
   */
  setStatus: adminProcedure.input(setUserStatusInput).mutation(async ({ ctx, input }) => {
    const tx = ctx.tx as Tx;
    const rows = await tx
      .update(users)
      .set({ status: input.status })
      .where(
        and(
          eq(users.id, input.userId),
          eq(users.schoolId, ctx.session!.schoolId),
          isNull(users.deletedAt),
        ),
      )
      .returning({ id: users.id, status: users.status });
    if (rows.length === 0) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
    }
    return { ok: true, status: rows[0]!.status };
  }),
});

// Silence unused import warnings for desc/personHold (kept for future list joins).
void desc;
void personHold;
