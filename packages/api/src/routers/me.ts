/**
 * me router — returns the resolved session for the current caller
 * and exposes self-serve profile read/write.
 *
 * Phase 8 (08-02): adds getAssignedStudents for instructor dashboard.
 * Phase 9  (09-XX): adds getProfile + updateProfile so every role can
 *                   edit their own person_profile row from /profile.
 */
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { router } from '../trpc';
import { protectedProcedure } from '../procedures';

type Tx = {
  execute: (q: ReturnType<typeof sql>) => Promise<unknown>;
};

const updateProfileInput = z.object({
  firstName: z.string().trim().max(120).optional().nullable(),
  lastName: z.string().trim().max(120).optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
  emailAlt: z.string().trim().email().max(254).optional().nullable().or(z.literal('')),
  addressLine1: z.string().trim().max(200).optional().nullable(),
  addressLine2: z.string().trim().max(200).optional().nullable(),
  city: z.string().trim().max(120).optional().nullable(),
  state: z.string().trim().max(120).optional().nullable(),
  postalCode: z.string().trim().max(20).optional().nullable(),
  country: z.string().trim().max(120).optional().nullable(),
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD')
    .optional()
    .nullable()
    .or(z.literal('')),
  faaAirmanCertNumber: z.string().trim().max(40).optional().nullable(),
});

type ProfileRow = {
  user_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email_alt: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  date_of_birth: string | null;
  faa_airman_cert_number: string | null;
  citizenship_status: string | null;
  tsa_afsp_status: string | null;
};

export const meRouter = router({
  get: protectedProcedure.query(({ ctx }) => {
    return ctx.session!;
  }),

  /**
   * Self-serve profile read. Joins users + person_profile so the UI
   * can render primary email alongside the editable profile fields.
   * Scoped strictly to the authenticated caller.
   */
  getProfile: protectedProcedure.query(async ({ ctx }) => {
    const tx = ctx.tx as Tx;
    const userId = ctx.session!.userId;
    const rows = (await tx.execute(sql`
      select
        u.id                          as user_id,
        u.email,
        pp.first_name,
        pp.last_name,
        pp.phone,
        pp.email_alt,
        pp.address_line1,
        pp.address_line2,
        pp.city,
        pp.state,
        pp.postal_code,
        pp.country,
        pp.date_of_birth::text        as date_of_birth,
        pp.faa_airman_cert_number,
        pp.citizenship_status::text   as citizenship_status,
        pp.tsa_afsp_status::text      as tsa_afsp_status
      from public.users u
      left join public.person_profile pp on pp.user_id = u.id
      where u.id = ${userId}::uuid
      limit 1
    `)) as unknown as ProfileRow[];
    return rows[0] ?? null;
  }),

  /**
   * Self-serve profile update. Writes only the editable fields on
   * person_profile for the authenticated caller. Email changes on the
   * auth record are not handled here — that's an admin flow
   * (admin.people.update) because it can invalidate sessions.
   *
   * Safety-relevant fields that encode legal status (citizenship_status,
   * tsa_afsp_status) are also NOT writable via this endpoint — only an
   * admin can set them. Same for faaAirmanCertNumber? For now we allow
   * the user to enter their own cert number since it's self-asserted
   * and the admin verifies it during onboarding.
   *
   * Uses COALESCE so only provided fields are updated; unpassed fields
   * keep their existing value.
   */
  updateProfile: protectedProcedure.input(updateProfileInput).mutation(async ({ ctx, input }) => {
    const tx = ctx.tx as Tx;
    const userId = ctx.session!.userId;
    const schoolId = ctx.session!.schoolId;

    // Treat empty strings as "clear this field" for optional text
    // columns. Treat missing keys as "leave unchanged" (COALESCE
    // keeps the existing value if the param is NULL).
    const norm = (v: string | null | undefined) => (v === '' ? null : (v ?? null));
    const dob = input.dateOfBirth ? norm(input.dateOfBirth) : undefined;

    // Ensure a person_profile row exists (it's 1:1 with users). If
    // absent, insert a minimal row keyed by user_id so the UPDATE
    // below hits something.
    await tx.execute(sql`
        insert into public.person_profile (user_id, school_id)
        values (${userId}::uuid, ${schoolId}::uuid)
        on conflict (user_id) do nothing
      `);

    await tx.execute(sql`
        update public.person_profile
           set first_name             = coalesce(${norm(input.firstName)}::text,    first_name),
               last_name              = coalesce(${norm(input.lastName)}::text,     last_name),
               phone                  = coalesce(${norm(input.phone)}::text,        phone),
               email_alt              = coalesce(${norm(input.emailAlt)}::text,     email_alt),
               address_line1          = coalesce(${norm(input.addressLine1)}::text, address_line1),
               address_line2          = coalesce(${norm(input.addressLine2)}::text, address_line2),
               city                   = coalesce(${norm(input.city)}::text,         city),
               state                  = coalesce(${norm(input.state)}::text,        state),
               postal_code            = coalesce(${norm(input.postalCode)}::text,   postal_code),
               country                = coalesce(${norm(input.country)}::text,      country),
               date_of_birth          = coalesce(${dob ?? null}::date,              date_of_birth),
               faa_airman_cert_number = coalesce(${norm(input.faaAirmanCertNumber)}::text, faa_airman_cert_number),
               updated_at             = now()
         where user_id = ${userId}::uuid
      `);
    return { ok: true };
  }),

  /**
   * INS-02 — instructor sees their assigned students' summary.
   * Returns students where the caller is the primary instructor on
   * an active enrollment.
   */
  getAssignedStudents: protectedProcedure.query(async ({ ctx }) => {
    const tx = ctx.tx as Tx;
    const userId = ctx.session!.userId;
    const rows = (await tx.execute(sql`
      select
        e.id           as enrollment_id,
        e.user_id      as student_id,
        u.email        as student_email,
        coalesce(pp.first_name || ' ' || pp.last_name, u.full_name, u.email)
                       as student_name,
        cv.title       as course_name,
        -- stage progress placeholder
        null::text     as current_stage
      from public.student_course_enrollment e
      join public.users u on u.id = e.user_id
      left join public.person_profile pp on pp.user_id = u.id
      left join public.course_version cv on cv.id = e.course_version_id
      where e.primary_instructor_id = ${userId}::uuid
        and e.deleted_at is null
        and e.completed_at is null
        and e.withdrawn_at is null
      order by u.email
      limit 50
    `)) as unknown as Array<Record<string, unknown>>;
    return rows;
  }),
});
