-- Phase 2 Plan 3: public.submit_registration SECURITY DEFINER function
--
-- The self-registration flow (PER-02) hits a publicProcedure that has
-- no JWT claims, so it can't satisfy RLS on public.users directly. This
-- function runs as the owner (postgres) and inserts the pending user +
-- person_profile in one atomic step. Duplicate-email submissions are
-- rejected cleanly rather than leaking the underlying unique-constraint
-- error back to the caller.
--
-- Returns: the new public.users.id. auth.users creation is deferred
-- until an admin approves the registration.

create or replace function public.submit_registration(
  p_school_id uuid,
  p_email text,
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_requested_role public.role
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid;
begin
  if p_requested_role not in ('student', 'rental_customer') then
    raise exception 'Only students and rental customers may self-register'
      using errcode = '22023';
  end if;
  if exists (
    select 1 from public.users where email = p_email
  ) then
    raise exception 'Email already registered' using errcode = '23505';
  end if;
  if not exists (select 1 from public.schools where id = p_school_id) then
    raise exception 'Unknown school' using errcode = '23503';
  end if;

  v_user_id := gen_random_uuid();

  -- Bypass audit trigger replication for the public-insert path; the
  -- audit trigger still fires and records actor_kind='system' because
  -- app.user_id is unset in this connection.
  insert into public.users (id, school_id, email, full_name, status)
  values (
    v_user_id,
    p_school_id,
    p_email,
    p_first_name || ' ' || p_last_name,
    'pending'
  );

  insert into public.person_profile (user_id, school_id, first_name, last_name, phone)
  values (v_user_id, p_school_id, p_first_name, p_last_name, p_phone);

  return v_user_id;
end;
$$;

revoke all on function public.submit_registration(uuid, text, text, text, text, public.role) from public;
grant execute on function public.submit_registration(uuid, text, text, text, text, public.role) to anon, authenticated, service_role;
